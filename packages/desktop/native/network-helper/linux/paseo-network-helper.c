#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <sched.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define PASEO_NETWORK_HELPER_VERSION "2"
#define PROXY_TOKEN_ENV "PASEO_PROJECT_PROXY_TOKEN"

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

static int wait_for_child(pid_t child) {
  int status = 0;
  for (;;) {
    if (waitpid(child, &status, 0) >= 0) {
      break;
    }
    if (errno != EINTR) {
      perror("paseo-network-helper: waitpid");
      return EXIT_FAILURE;
    }
  }
  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  if (WIFSIGNALED(status)) {
    return 128 + WTERMSIG(status);
  }
  return EXIT_FAILURE;
}

static bool find_tool(const char *name, char *candidate, size_t candidate_size) {
  const char *directories[] = {"/usr/sbin", "/sbin", "/usr/bin", "/bin"};
  for (size_t index = 0; index < sizeof(directories) / sizeof(directories[0]); index += 1) {
    const int written = snprintf(candidate, candidate_size, "%s/%s", directories[index], name);
    if (written > 0 && (size_t)written < candidate_size && access(candidate, X_OK) == 0) {
      return true;
    }
  }
  return false;
}

static int run_tool(const char *tool, char *const arguments[], bool quiet_failure) {
  const pid_t child = fork();
  if (child < 0) {
    perror("paseo-network-helper: fork tool");
    return EXIT_FAILURE;
  }
  if (child == 0) {
    if (quiet_failure) {
      const int null_fd = open("/dev/null", O_WRONLY);
      if (null_fd >= 0) {
        (void)dup2(null_fd, STDERR_FILENO);
        close(null_fd);
      }
    }
    execv(tool, arguments);
    _exit(127);
  }
  return wait_for_child(child);
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

static int run_ip(const char *ip_tool, char *const arguments[]) {
  if (run_tool(ip_tool, arguments, false) != EXIT_SUCCESS) {
    fprintf(stderr, "paseo-network-helper: ip command failed\n");
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

static bool find_namespace_iptables(const char *ip_tool,
                                    const char *namespace_name,
                                    char *iptables_tool,
                                    size_t iptables_tool_size) {
  const char *candidates[] = {"iptables", "iptables-legacy"};
  for (size_t index = 0; index < sizeof(candidates) / sizeof(candidates[0]); index += 1) {
    if (!find_tool(candidates[index], iptables_tool, iptables_tool_size)) {
      continue;
    }
    // Debian's default iptables-nft backend can sometimes list rules in a
    // nested container namespace even though the kernel rejects mutations.
    // Probe the write operation that strict isolation actually depends on,
    // then fall back to iptables-legacy when nft is read-only/unavailable.
    char *create_probe_chain[] = {(char *)ip_tool,
                                  "netns",
                                  "exec",
                                  (char *)namespace_name,
                                  iptables_tool,
                                  "-N",
                                  "PASEO_PROBE",
                                  NULL};
    if (run_tool(ip_tool, create_probe_chain, true) != EXIT_SUCCESS) {
      continue;
    }
    char *delete_probe_chain[] = {(char *)ip_tool,
                                  "netns",
                                  "exec",
                                  (char *)namespace_name,
                                  iptables_tool,
                                  "-X",
                                  "PASEO_PROBE",
                                  NULL};
    if (run_tool(ip_tool, delete_probe_chain, false) == EXIT_SUCCESS) {
      return true;
    }
  }
  return false;
}

static int configure_proxy_namespace(const char *namespace_name,
                                     const char *host_interface,
                                     const char *child_interface,
                                     const char *host_ip,
                                     const char *host_cidr,
                                     const char *child_cidr,
                                     const char *proxy_port) {
  char ip_tool[128];
  char iptables_tool[128];
  if (!find_tool("ip", ip_tool, sizeof(ip_tool))) {
    fprintf(stderr, "paseo-network-helper: iproute2 is required\n");
    return EXIT_FAILURE;
  }

  char *netns_add[] = {(char *)ip_tool, "netns", "add", (char *)namespace_name, NULL};
  char *link_add[] = {(char *)ip_tool,
                      "link",
                      "add",
                      (char *)host_interface,
                      "type",
                      "veth",
                      "peer",
                      "name",
                      (char *)child_interface,
                      NULL};
  char *peer_move[] = {(char *)ip_tool,
                       "link",
                       "set",
                       (char *)child_interface,
                       "netns",
                       (char *)namespace_name,
                       NULL};
  char *host_address[] = {
      (char *)ip_tool, "addr", "add", (char *)host_cidr, "dev", (char *)host_interface, NULL};
  char *host_up[] = {
      (char *)ip_tool, "link", "set", (char *)host_interface, "up", NULL};
  char *child_address[] = {(char *)ip_tool,
                           "-n",
                           (char *)namespace_name,
                           "addr",
                           "add",
                           (char *)child_cidr,
                           "dev",
                           (char *)child_interface,
                           NULL};
  char *child_up[] = {(char *)ip_tool,
                      "-n",
                      (char *)namespace_name,
                      "link",
                      "set",
                      (char *)child_interface,
                      "up",
                      NULL};
  char *loopback_up[] = {(char *)ip_tool,
                         "-n",
                         (char *)namespace_name,
                         "link",
                         "set",
                         "lo",
                         "up",
                         NULL};

  if (run_ip(ip_tool, netns_add) != EXIT_SUCCESS ||
      run_ip(ip_tool, link_add) != EXIT_SUCCESS ||
      run_ip(ip_tool, peer_move) != EXIT_SUCCESS ||
      run_ip(ip_tool, host_address) != EXIT_SUCCESS ||
      run_ip(ip_tool, host_up) != EXIT_SUCCESS ||
      run_ip(ip_tool, child_address) != EXIT_SUCCESS ||
      run_ip(ip_tool, child_up) != EXIT_SUCCESS ||
      run_ip(ip_tool, loopback_up) != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  if (!find_namespace_iptables(
          ip_tool, namespace_name, iptables_tool, sizeof(iptables_tool))) {
    fprintf(stderr,
            "paseo-network-helper: no working iptables backend is available in the namespace\n");
    return EXIT_FAILURE;
  }

  char *allow_loopback[] = {(char *)ip_tool,
                            "netns",
                            "exec",
                            (char *)namespace_name,
                            (char *)iptables_tool,
                            "-A",
                            "OUTPUT",
                            "-o",
                            "lo",
                            "-j",
                            "ACCEPT",
                            NULL};
  char *allow_proxy[] = {(char *)ip_tool,
                         "netns",
                         "exec",
                         (char *)namespace_name,
                         (char *)iptables_tool,
                         "-A",
                         "OUTPUT",
                         "-d",
                         (char *)host_ip,
                         "-p",
                         "tcp",
                         "--dport",
                         (char *)proxy_port,
                         "-j",
                         "ACCEPT",
                         NULL};
  char *drop_other[] = {(char *)ip_tool,
                        "netns",
                        "exec",
                        (char *)namespace_name,
                        (char *)iptables_tool,
                        "-A",
                        "OUTPUT",
                        "-j",
                        "DROP",
                        NULL};
  if (run_tool(ip_tool, allow_loopback, false) != EXIT_SUCCESS ||
      run_tool(ip_tool, allow_proxy, false) != EXIT_SUCCESS ||
      run_tool(ip_tool, drop_other, false) != EXIT_SUCCESS) {
    fprintf(stderr, "paseo-network-helper: failed to install namespace firewall rules\n");
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

static void cleanup_proxy_namespace(const char *namespace_name, const char *host_interface) {
  char ip_tool[128];
  if (find_tool("ip", ip_tool, sizeof(ip_tool))) {
    char *delete_namespace[] = {
        (char *)ip_tool, "netns", "del", (char *)namespace_name, NULL};
    (void)run_tool(ip_tool, delete_namespace, true);
    char *delete_link[] = {
        (char *)ip_tool, "link", "del", (char *)host_interface, NULL};
    (void)run_tool(ip_tool, delete_link, true);
  }
}

static int enter_named_network(const char *namespace_name,
                               const char *host_ip,
                               int proxy_port,
                               uid_t caller_uid,
                               gid_t caller_gid,
                               char **command) {
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  char namespace_path[128];
  const int written =
      snprintf(namespace_path, sizeof(namespace_path), "/run/netns/%s", namespace_name);
  if (written <= 0 || (size_t)written >= sizeof(namespace_path)) {
    return EXIT_FAILURE;
  }
  const int namespace_fd = open(namespace_path, O_RDONLY | O_CLOEXEC);
  if (namespace_fd < 0) {
    perror("paseo-network-helper: open network namespace");
    return EXIT_FAILURE;
  }
  if (setns(namespace_fd, CLONE_NEWNET) != 0) {
    perror("paseo-network-helper: setns");
    close(namespace_fd);
    return EXIT_FAILURE;
  }
  close(namespace_fd);
  if (configure_proxy_environment(host_ip, proxy_port) != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  return drop_privileges_and_exec(caller_uid, caller_gid, command);
}

static int launch_proxy_network(uid_t caller_uid,
                                gid_t caller_gid,
                                int proxy_port,
                                char **command) {
  const long helper_pid = (long)getpid();
  char namespace_name[32];
  char host_interface[16];
  char child_interface[16];
  char host_ip[32];
  char child_ip[32];
  char host_cidr[40];
  char child_cidr[40];
  char proxy_port_text[8];
  const unsigned int slot = ((unsigned int)helper_pid % 16000U) + 1U;
  const unsigned int address = slot * 4U;
  const unsigned int third = address / 256U;
  const unsigned int fourth = address % 256U;
  (void)snprintf(namespace_name, sizeof(namespace_name), "paseo-%ld", helper_pid);
  (void)snprintf(host_interface, sizeof(host_interface), "pvh%08lx", helper_pid & 0xffffffffL);
  (void)snprintf(child_interface, sizeof(child_interface), "pvn%08lx", helper_pid & 0xffffffffL);
  (void)snprintf(host_ip, sizeof(host_ip), "169.254.%u.%u", third, fourth + 1U);
  (void)snprintf(child_ip, sizeof(child_ip), "169.254.%u.%u", third, fourth + 2U);
  (void)snprintf(host_cidr, sizeof(host_cidr), "%s/30", host_ip);
  (void)snprintf(child_cidr, sizeof(child_cidr), "%s/30", child_ip);
  (void)snprintf(proxy_port_text, sizeof(proxy_port_text), "%d", proxy_port);

  cleanup_proxy_namespace(namespace_name, host_interface);
  if (configure_proxy_namespace(namespace_name,
                                host_interface,
                                child_interface,
                                host_ip,
                                host_cidr,
                                child_cidr,
                                proxy_port_text) != EXIT_SUCCESS) {
    cleanup_proxy_namespace(namespace_name, host_interface);
    return EXIT_FAILURE;
  }

  const pid_t child = fork();
  if (child < 0) {
    perror("paseo-network-helper: fork proxy child");
    cleanup_proxy_namespace(namespace_name, host_interface);
    return EXIT_FAILURE;
  }
  if (child == 0) {
    return enter_named_network(
        namespace_name, host_ip, proxy_port, caller_uid, caller_gid, command);
  }
  const int status = wait_for_child(child);
  cleanup_proxy_namespace(namespace_name, host_interface);
  return status;
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
