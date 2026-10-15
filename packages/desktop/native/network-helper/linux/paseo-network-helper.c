#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <net/if.h>
#include <netinet/in.h>
#include <poll.h>
#include <sched.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define PASEO_NETWORK_HELPER_VERSION "3"
#define PROXY_TOKEN_ENV "PASEO_PROJECT_PROXY_TOKEN"
#define RELAY_BUFFER_SIZE 16384
#define RELAY_MAX_WORKERS 64

static void print_usage(FILE *stream) {
  fprintf(stream,
          "Usage:\n"
          "  paseo-network-helper --status-json\n"
          "  paseo-network-helper --proxy-port PORT -- COMMAND [ARG ...]\n"
          "  paseo-network-helper -- COMMAND [ARG ...]\n");
}

static int print_status(void) {
  const bool privilege_active = geteuid() == 0;
  printf("{\"version\":\"%s\",\"capability\":\"project_proxy\","
         "\"privilege_active\":%s,\"strict_ready\":true}\n",
         PASEO_NETWORK_HELPER_VERSION,
         privilege_active ? "true" : "false");
  return privilege_active ? EXIT_SUCCESS : EXIT_FAILURE;
}

static int decode_child_status(int status) {
  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  if (WIFSIGNALED(status)) {
    return 128 + WTERMSIG(status);
  }
  return EXIT_FAILURE;
}

static int wait_for_child(pid_t child) {
  int status = 0;
  for (;;) {
    if (waitpid(child, &status, 0) >= 0) {
      return decode_child_status(status);
    }
    if (errno != EINTR) {
      perror("paseo-network-helper: waitpid");
      return EXIT_FAILURE;
    }
  }
}

static void restore_default_signals(void) {
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = SIG_DFL;
  sigemptyset(&action.sa_mask);
  for (int signal_number = 1; signal_number < NSIG; signal_number += 1) {
    if (signal_number == SIGKILL || signal_number == SIGSTOP) {
      continue;
    }
    (void)sigaction(signal_number, &action, NULL);
  }
  sigset_t empty_mask;
  sigemptyset(&empty_mask);
  (void)sigprocmask(SIG_SETMASK, &empty_mask, NULL);
}

static int set_parent_death_signal(void) {
  if (prctl(PR_SET_PDEATHSIG, SIGKILL, 0, 0, 0) != 0) {
    perror("paseo-network-helper: PR_SET_PDEATHSIG");
    return EXIT_FAILURE;
  }
  if (getppid() == 1) {
    fprintf(stderr, "paseo-network-helper: parent exited before isolation completed\n");
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

static int drop_privileges_and_exec(uid_t caller_uid, gid_t caller_gid, char **command) {
  if (setgroups(0, NULL) != 0) {
    perror("paseo-network-helper: setgroups");
    return EXIT_FAILURE;
  }
  if (setresgid(caller_gid, caller_gid, caller_gid) != 0) {
    perror("paseo-network-helper: setresgid");
    return EXIT_FAILURE;
  }
  if (setresuid(caller_uid, caller_uid, caller_uid) != 0) {
    perror("paseo-network-helper: setresuid");
    return EXIT_FAILURE;
  }
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    perror("paseo-network-helper: PR_SET_NO_NEW_PRIVS");
    return EXIT_FAILURE;
  }
  // Linux clears PR_SET_PDEATHSIG when effective or filesystem credentials change.
  // Re-arm it after dropping privileges so the isolated process tree cannot outlive
  // the privileged helper that owns its namespace.
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }

  restore_default_signals();
  execvp(command[0], command);
  fprintf(stderr, "paseo-network-helper: execvp(%s): %s\n", command[0], strerror(errno));
  return errno == ENOENT ? 127 : 126;
}

static int enter_isolated_network(uid_t caller_uid, gid_t caller_gid, char **command) {
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  if (unshare(CLONE_NEWNET) != 0) {
    perror("paseo-network-helper: unshare(CLONE_NEWNET)");
    return EXIT_FAILURE;
  }

  return drop_privileges_and_exec(caller_uid, caller_gid, command);
}

static bool valid_proxy_token(const char *token) {
  if (token == NULL) {
    return false;
  }
  const size_t length = strlen(token);
  if (length < 16 || length > 128) {
    return false;
  }
  for (size_t index = 0; index < length; index += 1) {
    const char value = token[index];
    if (!((value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') ||
          (value >= '0' && value <= '9') || value == '_' || value == '-')) {
      return false;
    }
  }
  return true;
}

static int configure_proxy_environment(const char *host_ip, int proxy_port) {
  const char *token = getenv(PROXY_TOKEN_ENV);
  if (!valid_proxy_token(token)) {
    fprintf(stderr, "paseo-network-helper: missing or invalid proxy token\n");
    return EXIT_FAILURE;
  }
  char proxy_url[384];
  const int written = snprintf(proxy_url,
                               sizeof(proxy_url),
                               "http://paseo:%s@%s:%d",
                               token,
                               host_ip,
                               proxy_port);
  if (written <= 0 || (size_t)written >= sizeof(proxy_url)) {
    fprintf(stderr, "paseo-network-helper: proxy URL is too long\n");
    return EXIT_FAILURE;
  }
  if (setenv("HTTP_PROXY", proxy_url, 1) != 0 || setenv("http_proxy", proxy_url, 1) != 0 ||
      setenv("HTTPS_PROXY", proxy_url, 1) != 0 || setenv("https_proxy", proxy_url, 1) != 0 ||
      setenv("ALL_PROXY", proxy_url, 1) != 0 || setenv("all_proxy", proxy_url, 1) != 0 ||
      setenv("NO_PROXY", "", 1) != 0 || setenv("no_proxy", "", 1) != 0 ||
      setenv("PASEO_PROJECT_PROXY_URL", proxy_url, 1) != 0 ||
      setenv("PASEO_PROJECT_PROXY_HOST", host_ip, 1) != 0 || unsetenv(PROXY_TOKEN_ENV) != 0) {
    perror("paseo-network-helper: set proxy environment");
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

typedef struct {
  unsigned char data[RELAY_BUFFER_SIZE];
  size_t offset;
  size_t length;
  bool source_eof;
  bool destination_shutdown;
} RelayBuffer;

static int open_network_namespace(void) {
  const int namespace_fd = open("/proc/self/ns/net", O_RDONLY | O_CLOEXEC);
  if (namespace_fd < 0) {
    perror("paseo-network-helper: open network namespace");
  }
  return namespace_fd;
}

static int enable_loopback(void) {
  const int control_fd = socket(AF_INET, SOCK_DGRAM | SOCK_CLOEXEC, 0);
  if (control_fd < 0) {
    perror("paseo-network-helper: create loopback control socket");
    return EXIT_FAILURE;
  }
  struct ifreq request;
  memset(&request, 0, sizeof(request));
  (void)snprintf(request.ifr_name, sizeof(request.ifr_name), "lo");
  if (ioctl(control_fd, SIOCGIFFLAGS, &request) != 0) {
    perror("paseo-network-helper: read loopback flags");
    close(control_fd);
    return EXIT_FAILURE;
  }
  request.ifr_flags = (short)(request.ifr_flags | IFF_UP);
  if (ioctl(control_fd, SIOCSIFFLAGS, &request) != 0) {
    perror("paseo-network-helper: enable loopback");
    close(control_fd);
    return EXIT_FAILURE;
  }
  close(control_fd);
  return EXIT_SUCCESS;
}

static int create_isolated_listener(int proxy_port) {
  const int listener = socket(AF_INET, SOCK_STREAM | SOCK_CLOEXEC, 0);
  if (listener < 0) {
    perror("paseo-network-helper: create isolated proxy listener");
    return -1;
  }
  const int enabled = 1;
  if (setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &enabled, sizeof(enabled)) != 0) {
    perror("paseo-network-helper: configure isolated proxy listener");
    close(listener);
    return -1;
  }
  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((uint16_t)proxy_port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(listener, (struct sockaddr *)&address, sizeof(address)) != 0) {
    perror("paseo-network-helper: bind isolated proxy listener");
    close(listener);
    return -1;
  }
  if (listen(listener, RELAY_MAX_WORKERS) != 0) {
    perror("paseo-network-helper: listen on isolated proxy socket");
    close(listener);
    return -1;
  }
  return listener;
}

static int set_nonblocking(int socket_fd) {
  const int flags = fcntl(socket_fd, F_GETFL, 0);
  if (flags < 0 || fcntl(socket_fd, F_SETFL, flags | O_NONBLOCK) != 0) {
    perror("paseo-network-helper: configure relay socket");
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

static int connect_host_proxy(int proxy_port) {
  const int proxy_socket = socket(AF_INET, SOCK_STREAM | SOCK_CLOEXEC, 0);
  if (proxy_socket < 0) {
    perror("paseo-network-helper: create host proxy socket");
    return -1;
  }
  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((uint16_t)proxy_port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  for (;;) {
    if (connect(proxy_socket, (struct sockaddr *)&address, sizeof(address)) == 0) {
      return proxy_socket;
    }
    if (errno != EINTR) {
      perror("paseo-network-helper: connect host proxy");
      close(proxy_socket);
      return -1;
    }
  }
}

static bool relay_buffer_has_space(const RelayBuffer *buffer) {
  return buffer->offset > 0 || buffer->offset + buffer->length < sizeof(buffer->data);
}

static int read_relay_buffer(int source, RelayBuffer *buffer) {
  if (buffer->source_eof) {
    return EXIT_SUCCESS;
  }
  if (buffer->offset > 0 &&
      buffer->offset + buffer->length == sizeof(buffer->data)) {
    memmove(buffer->data, buffer->data + buffer->offset, buffer->length);
    buffer->offset = 0;
  }
  const size_t available = sizeof(buffer->data) - buffer->offset - buffer->length;
  if (available == 0) {
    return EXIT_SUCCESS;
  }
  const ssize_t received =
      recv(source, buffer->data + buffer->offset + buffer->length, available, 0);
  if (received > 0) {
    buffer->length += (size_t)received;
    return EXIT_SUCCESS;
  }
  if (received == 0) {
    buffer->source_eof = true;
    return EXIT_SUCCESS;
  }
  if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK) {
    return EXIT_SUCCESS;
  }
  return EXIT_FAILURE;
}

static int write_relay_buffer(int destination, RelayBuffer *buffer) {
  while (buffer->length > 0) {
    const ssize_t written = send(
        destination, buffer->data + buffer->offset, buffer->length, MSG_NOSIGNAL);
    if (written > 0) {
      buffer->offset += (size_t)written;
      buffer->length -= (size_t)written;
      if (buffer->length == 0) {
        buffer->offset = 0;
      }
      continue;
    }
    if (written < 0 && errno == EINTR) {
      continue;
    }
    if (written < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      return EXIT_SUCCESS;
    }
    return EXIT_FAILURE;
  }
  if (buffer->source_eof && !buffer->destination_shutdown) {
    (void)shutdown(destination, SHUT_WR);
    buffer->destination_shutdown = true;
  }
  return EXIT_SUCCESS;
}

static int relay_connection(int client_socket, int proxy_socket) {
  if (set_nonblocking(client_socket) != EXIT_SUCCESS ||
      set_nonblocking(proxy_socket) != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }

  RelayBuffer client_to_proxy = {0};
  RelayBuffer proxy_to_client = {0};
  for (;;) {
    if (write_relay_buffer(proxy_socket, &client_to_proxy) != EXIT_SUCCESS ||
        write_relay_buffer(client_socket, &proxy_to_client) != EXIT_SUCCESS) {
      return EXIT_FAILURE;
    }
    if (client_to_proxy.source_eof && client_to_proxy.length == 0 &&
        proxy_to_client.source_eof && proxy_to_client.length == 0) {
      return EXIT_SUCCESS;
    }

    struct pollfd sockets[2];
    memset(sockets, 0, sizeof(sockets));
    sockets[0].fd = client_socket;
    sockets[1].fd = proxy_socket;
    if (!client_to_proxy.source_eof && relay_buffer_has_space(&client_to_proxy)) {
      sockets[0].events |= POLLIN;
    }
    if (proxy_to_client.length > 0) {
      sockets[0].events |= POLLOUT;
    }
    if (!proxy_to_client.source_eof && relay_buffer_has_space(&proxy_to_client)) {
      sockets[1].events |= POLLIN;
    }
    if (client_to_proxy.length > 0) {
      sockets[1].events |= POLLOUT;
    }

    const int ready = poll(sockets, 2, -1);
    if (ready < 0) {
      if (errno == EINTR) {
        continue;
      }
      return EXIT_FAILURE;
    }
    if ((sockets[0].revents & POLLNVAL) != 0 ||
        (sockets[1].revents & POLLNVAL) != 0) {
      return EXIT_FAILURE;
    }
    if ((sockets[0].revents & (POLLIN | POLLHUP)) != 0 &&
        read_relay_buffer(client_socket, &client_to_proxy) != EXIT_SUCCESS) {
      return EXIT_FAILURE;
    }
    if ((sockets[1].revents & (POLLIN | POLLHUP)) != 0 &&
        read_relay_buffer(proxy_socket, &proxy_to_client) != EXIT_SUCCESS) {
      return EXIT_FAILURE;
    }
    if ((sockets[0].revents & POLLOUT) != 0 &&
        write_relay_buffer(client_socket, &proxy_to_client) != EXIT_SUCCESS) {
      return EXIT_FAILURE;
    }
    if ((sockets[1].revents & POLLOUT) != 0 &&
        write_relay_buffer(proxy_socket, &client_to_proxy) != EXIT_SUCCESS) {
      return EXIT_FAILURE;
    }
    if ((sockets[0].revents & POLLERR) != 0 ||
        (sockets[1].revents & POLLERR) != 0) {
      return EXIT_FAILURE;
    }
  }
}

static int harden_relay_process(void) {
  if (setgroups(0, NULL) != 0 || setresgid(0, 0, 0) != 0 ||
      setresuid(0, 0, 0) != 0) {
    perror("paseo-network-helper: protect relay credentials");
    return EXIT_FAILURE;
  }
  if (prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0 ||
      prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    perror("paseo-network-helper: protect relay process");
    return EXIT_FAILURE;
  }
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  if (unsetenv(PROXY_TOKEN_ENV) != 0) {
    perror("paseo-network-helper: clear relay proxy token");
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

static void handle_relay_child_exit(int signal_number) {
  (void)signal_number;
}

static int run_relay_server(int listener, int proxy_port) {
  if (setpgid(0, 0) != 0 && errno != EACCES) {
    perror("paseo-network-helper: create relay process group");
    return EXIT_FAILURE;
  }
  if (harden_relay_process() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  restore_default_signals();
  (void)signal(SIGPIPE, SIG_IGN);
  struct sigaction child_action;
  memset(&child_action, 0, sizeof(child_action));
  child_action.sa_handler = handle_relay_child_exit;
  sigemptyset(&child_action.sa_mask);
  if (sigaction(SIGCHLD, &child_action, NULL) != 0) {
    perror("paseo-network-helper: configure relay child signal");
    return EXIT_FAILURE;
  }

  size_t active_workers = 0;
  for (;;) {
    int worker_status = 0;
    while (waitpid(-1, &worker_status, WNOHANG) > 0) {
      if (active_workers > 0) {
        active_workers -= 1;
      }
    }

    const int client_socket = accept4(listener, NULL, NULL, SOCK_CLOEXEC);
    if (client_socket < 0) {
      if (errno == EINTR) {
        continue;
      }
      perror("paseo-network-helper: accept isolated proxy connection");
      return EXIT_FAILURE;
    }
    if (active_workers >= RELAY_MAX_WORKERS) {
      close(client_socket);
      continue;
    }

    const pid_t worker = fork();
    if (worker < 0) {
      perror("paseo-network-helper: fork relay worker");
      close(client_socket);
      continue;
    }
    if (worker == 0) {
      close(listener);
      if (set_parent_death_signal() != EXIT_SUCCESS) {
        close(client_socket);
        _exit(EXIT_FAILURE);
      }
      const int proxy_socket = connect_host_proxy(proxy_port);
      if (proxy_socket < 0) {
        close(client_socket);
        _exit(EXIT_FAILURE);
      }
      const int status = relay_connection(client_socket, proxy_socket);
      close(proxy_socket);
      close(client_socket);
      _exit(status);
    }
    active_workers += 1;
    close(client_socket);
  }
}

static void stop_relay_process_group(pid_t relay_pid) {
  if (relay_pid <= 0) {
    return;
  }
  (void)kill(-relay_pid, SIGKILL);
  (void)kill(relay_pid, SIGKILL);
  (void)wait_for_child(relay_pid);
}

static int wait_for_proxy_execution(pid_t command_pid, pid_t relay_pid) {
  for (;;) {
    int status = 0;
    const pid_t finished = waitpid(-1, &status, 0);
    if (finished < 0) {
      if (errno == EINTR) {
        continue;
      }
      perror("paseo-network-helper: wait for proxy execution");
      (void)kill(command_pid, SIGKILL);
      stop_relay_process_group(relay_pid);
      (void)wait_for_child(command_pid);
      return EXIT_FAILURE;
    }
    if (finished == command_pid) {
      stop_relay_process_group(relay_pid);
      return decode_child_status(status);
    }
    if (finished == relay_pid) {
      fprintf(stderr,
              "paseo-network-helper: proxy relay exited before the Project command\n");
      (void)kill(command_pid, SIGKILL);
      (void)wait_for_child(command_pid);
      return EXIT_FAILURE;
    }
  }
}

static int enter_proxy_network(int isolated_namespace_fd,
                               int proxy_port,
                               uid_t caller_uid,
                               gid_t caller_gid,
                               char **command) {
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  if (setns(isolated_namespace_fd, CLONE_NEWNET) != 0) {
    perror("paseo-network-helper: enter isolated proxy namespace");
    return EXIT_FAILURE;
  }
  close(isolated_namespace_fd);
  if (configure_proxy_environment("127.0.0.1", proxy_port) != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  return drop_privileges_and_exec(caller_uid, caller_gid, command);
}

static int launch_proxy_network(uid_t caller_uid,
                                gid_t caller_gid,
                                int proxy_port,
                                char **command) {
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  const int host_namespace_fd = open_network_namespace();
  if (host_namespace_fd < 0) {
    return EXIT_FAILURE;
  }
  if (unshare(CLONE_NEWNET) != 0) {
    perror("paseo-network-helper: create isolated proxy namespace");
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }
  if (enable_loopback() != EXIT_SUCCESS) {
    (void)setns(host_namespace_fd, CLONE_NEWNET);
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }
  const int listener = create_isolated_listener(proxy_port);
  if (listener < 0) {
    (void)setns(host_namespace_fd, CLONE_NEWNET);
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }
  const int isolated_namespace_fd = open_network_namespace();
  if (isolated_namespace_fd < 0) {
    close(listener);
    (void)setns(host_namespace_fd, CLONE_NEWNET);
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }
  if (setns(host_namespace_fd, CLONE_NEWNET) != 0) {
    perror("paseo-network-helper: return to host network namespace");
    close(isolated_namespace_fd);
    close(listener);
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }

  const pid_t relay_pid = fork();
  if (relay_pid < 0) {
    perror("paseo-network-helper: fork proxy relay");
    close(isolated_namespace_fd);
    close(listener);
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }
  if (relay_pid == 0) {
    close(isolated_namespace_fd);
    close(host_namespace_fd);
    _exit(run_relay_server(listener, proxy_port));
  }
  (void)setpgid(relay_pid, relay_pid);

  const pid_t command_pid = fork();
  if (command_pid < 0) {
    perror("paseo-network-helper: fork proxy child");
    stop_relay_process_group(relay_pid);
    close(isolated_namespace_fd);
    close(listener);
    close(host_namespace_fd);
    return EXIT_FAILURE;
  }
  if (command_pid == 0) {
    close(listener);
    close(host_namespace_fd);
    return enter_proxy_network(
        isolated_namespace_fd, proxy_port, caller_uid, caller_gid, command);
  }

  close(isolated_namespace_fd);
  close(listener);
  close(host_namespace_fd);
  return wait_for_proxy_execution(command_pid, relay_pid);
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--status-json") == 0) {
    return print_status();
  }
  int proxy_port = 0;
  int command_index = 0;
  if (argc >= 3 && strcmp(argv[1], "--") == 0) {
    command_index = 2;
  } else if (argc >= 5 && strcmp(argv[1], "--proxy-port") == 0 &&
             strcmp(argv[3], "--") == 0) {
    char *end = NULL;
    const long parsed_port = strtol(argv[2], &end, 10);
    if (end == argv[2] || *end != '\0' || parsed_port < 1 || parsed_port > 65535) {
      fprintf(stderr, "paseo-network-helper: invalid proxy port\n");
      return 64;
    }
    proxy_port = (int)parsed_port;
    command_index = 4;
  } else {
    print_usage(stderr);
    return 64;
  }
  if (geteuid() != 0) {
    fprintf(stderr,
            "paseo-network-helper: root privilege is inactive; install the helper as "
            "root:root mode 4755\n");
    return 77;
  }

  const uid_t caller_uid = getuid();
  const gid_t caller_gid = getgid();
  if (caller_uid == 0 || caller_gid == 0) {
    fprintf(stderr, "paseo-network-helper: refusing to launch a command for uid/gid 0\n");
    return 77;
  }

  if (proxy_port > 0) {
    return launch_proxy_network(
        caller_uid, caller_gid, proxy_port, &argv[command_index]);
  }

  const pid_t child = fork();
  if (child < 0) {
    perror("paseo-network-helper: fork");
    return EXIT_FAILURE;
  }
  if (child == 0) {
    return enter_isolated_network(caller_uid, caller_gid, &argv[command_index]);
  }
  return wait_for_child(child);
}
