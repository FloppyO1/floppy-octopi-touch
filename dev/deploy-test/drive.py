"""Runs a command on a fake terminal and answers its questions, like a person at the keyboard.

    python3 drive.py --transcript FILE --answers JSON [--no-prompt-after TEXT]
                     [--interrupt-on TEXT] -- CMD...

JSON is a list of [regex, reply]: each question (output that stops after "] " or ": ") must match
the next regex and gets the reply plus Enter. Exit codes: the command's own, or 90 = a question
nobody expected, 91 = a question after TEXT was printed, 92 = a question that does not match its
regex, 93 = answers left over, 94 = timeout. --interrupt-on sends Ctrl+C the first time TEXT is
printed.
"""

import argparse
import json
import os
import pty
import re
import select
import signal
import sys
import time

PROMPT_END = re.compile(r"(\] |: )$")
QUIET = 0.5


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--answers", default="[]")
    parser.add_argument("--no-prompt-after")
    parser.add_argument("--interrupt-on")
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    answers = json.loads(args.answers)

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)

    text = ""
    handled_at = -1
    interrupted = False
    deadline = time.monotonic() + args.timeout
    failure = 0
    with open(args.transcript, "w", encoding="utf-8") as log:

        def note(message: str) -> None:
            line = f"\n[drive] {message}\n"
            log.write(line)
            sys.stdout.write(line)
            sys.stdout.flush()

        while failure == 0:
            if time.monotonic() > deadline:
                note("timeout")
                failure = 94
                break
            ready, _, _ = select.select([fd], [], [], QUIET)
            if ready:
                try:
                    data = os.read(fd, 4096)
                except OSError:  # EIO: the command closed the terminal
                    break
                if not data:
                    break
                chunk = data.decode("utf-8", "replace")
                text += chunk
                log.write(chunk)
                sys.stdout.write(chunk)
                sys.stdout.flush()
                if args.interrupt_on and not interrupted and args.interrupt_on in text:
                    interrupted = True
                    note("sending Ctrl+C")
                    os.write(fd, b"\x03")
                continue

            # Quiet: is the command waiting on a question?
            tail = re.split(r"[\r\n]", text)[-1]
            if handled_at == len(text) or not PROMPT_END.search(tail):
                continue
            handled_at = len(text)
            question = tail.strip()
            before = text[: len(text) - len(tail)]
            if args.no_prompt_after and args.no_prompt_after in before:
                note(f"question after '{args.no_prompt_after}': {question!r}")
                failure = 91
            elif not answers:
                note(f"unexpected question: {question!r}")
                failure = 90
            else:
                pattern, reply = answers.pop(0)
                if not re.search(pattern, question):
                    note(f"question {question!r} does not match {pattern!r}")
                    failure = 92
                else:
                    note(f"question {question!r} -> {reply!r}")
                    os.write(fd, (reply + "\n").encode())

    if failure:
        os.killpg(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
        return failure
    _, status = os.waitpid(pid, 0)
    if answers:
        print(f"[drive] answers left over: {answers}")
        return 93
    return os.waitstatus_to_exitcode(status)


if __name__ == "__main__":
    sys.exit(main())
