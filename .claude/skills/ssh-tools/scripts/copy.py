#!/usr/bin/env python3
"""
文件复制（上传/下载）
用法: copy.py <src> <dst>
  下载: copy.py <device_id>:<remote_path> <local_path>
  上传: copy.py <local_path> <device_id>:<remote_path>
示例:
  copy.py nas:/volume1/data/file.txt /tmp/
  copy.py /tmp/file.txt nas:/volume1/data/
"""

import sys
from pathlib import Path

_script_dir = str(Path(__file__).parent)
if _script_dir in sys.path:
    sys.path.remove(_script_dir)
sys.path.insert(0, str(Path(__file__).parent / "lib"))

from connection import upload_file, download_file


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]

    if ':' in src and ':' not in dst:
        # 下载: device:remote -> local
        device_id, remote_path = src.split(':', 1)
        sys.exit(download_file(device_id, remote_path, dst))
    elif ':' in dst and ':' not in src:
        # 上传: local -> device:remote
        device_id, remote_path = dst.split(':', 1)
        sys.exit(upload_file(device_id, src, remote_path))
    else:
        print("[ERROR] 格式错误: 必须有且仅有一侧包含 device_id:", file=sys.stderr)
        print("  下载: copy.py <device_id>:<remote_path> <local_path>", file=sys.stderr)
        print("  上传: copy.py <local_path> <device_id>:<remote_path>", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
