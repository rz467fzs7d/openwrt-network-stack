#!/usr/bin/env python3
"""
sshpass 密码文件管理 - 避免密码出现在 ps aux 中
用法: with get_auth_file(password) as f: ...
"""

import os
import tempfile
import contextlib
from pathlib import Path


def get_auth_file(password: str) -> contextlib.AbstractContextManager:
    """
    创建临时密码文件，yield 文件路径，用完自动删除

    用法:
        with get_auth_file("mypassword") as pass_file:
            subprocess.run(["sshpass", "-f", pass_file, "ssh", ...])
    """
    @contextlib.contextmanager
    def _manager():
        fd, path = tempfile.mkstemp(prefix="sshpass_", suffix=".tmp")
        try:
            os.write(fd, password.encode())
            os.close(fd)
            os.chmod(path, 0o600)
            yield path
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
    return _manager()
