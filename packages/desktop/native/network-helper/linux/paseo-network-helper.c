#define _GNU_SOURCE

#include <errno.h>
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

#define PASEO_NETWORK_HELPER_VERSION "1"

static void print_usage(FILE *stream) {
  fprintf(stream,
          "Usage:\n"
          "  paseo-network-helper --status-json\n"
          "  paseo-network-helper -- COMMAND [ARG ...]\n");
}

static int print_status(void) {
  const bool privilege_active = geteuid() == 0;
  printf("{\"version\":\"%s\",\"capability\":\"deny_all\","
         "\"privilege_active\":%s,\"strict_ready\":false}\n",
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

static int enter_isolated_network(uid_t caller_uid, gid_t caller_gid, char **command) {
  if (set_parent_death_signal() != EXIT_SUCCESS) {
    return EXIT_FAILURE;
  }
  if (unshare(CLONE_NEWNET) != 0) {
    perror("paseo-network-helper: unshare(CLONE_NEWNET)");
    return EXIT_FAILURE;
  }

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

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--status-json") == 0) {
    return print_status();
  }
  if (argc < 3 || strcmp(argv[1], "--") != 0) {
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

  const pid_t child = fork();
  if (child < 0) {
    perror("paseo-network-helper: fork");
    return EXIT_FAILURE;
  }
  if (child == 0) {
    return enter_isolated_network(caller_uid, caller_gid, &argv[2]);
  }
  return wait_for_child(child);
}
