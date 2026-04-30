#!/usr/bin/env python3
"""
SSH 执行命令
用法: exec.py <device_identifier> <command>
示例: exec.py mmm4 'ls -la /volume1'

自适应: IP(LAN→TailScale→Zerotier) / 方法(sshpass→paramiko) / sudo
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "lib"))

from connection import run_cmd


def main():
    if len(sys.argv) < 3:
        print("用法: exec.py <device_identifier> <command>")
        print("示例: exec.py mmm4 'ls -la /volume1'")
        sys.exit(1)

    identifier = sys.argv[1]
    command = " ".join(sys.argv[2:])

    exit_code, output = run_cmd(identifier, command)
    print(output, end='')
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
