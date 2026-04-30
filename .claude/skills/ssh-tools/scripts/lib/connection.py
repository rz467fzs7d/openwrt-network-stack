#!/usr/bin/env python3
"""
统一连接层 - 自适应 IP、方法、sudo、密钥
"""

import os
import sys
import subprocess
import time
import base64
import socket
from pathlib import Path

# 防止 scripts/ 目录遮蔽标准库（如 copy.py 遮蔽 copy 模块）
_scripts_dir = str(Path(__file__).parent.parent)
if _scripts_dir in sys.path:
    sys.path.remove(_scripts_dir)

from device_selector import ConfigLoader
from sshpass_auth import get_auth_file as _auth_file


# ---- SSH Key 管理 ----

def get_local_key() -> tuple[str, str]:
    """
    获取或生成 Ed25519 SSH 密钥，返回 (private_key_path, public_key_content)
    """
    ssh_dir = Path.home() / ".ssh"
    ssh_dir.mkdir(mode=0o700, exist_ok=True)

    key_path = ssh_dir / "id_ed25519"
    pub_path = ssh_dir / "id_ed25519.pub"

    if not key_path.exists():
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-f", str(key_path), "-N", "", "-C", "claude-code@homelab"],
            capture_output=True, timeout=30
        )

    pub_content = ""
    if pub_path.exists():
        pub_content = pub_path.read_text().strip()
    else:
        r = subprocess.run(
            ["ssh-keygen", "-y", "-f", str(key_path)],
            capture_output=True, text=True, timeout=10
        )
        pub_content = r.stdout.strip()

    return str(key_path), pub_content


def _get_remote_user_home(host: str, user: str, password: str, timeout: int = 10) -> str:
    """获取远程用户的 home 目录（用于 Synology 等多 home 目录系统）"""
    def _exec(client, cmd_str):
        transport = client.get_transport()
        channel = transport.open_session()
        channel.get_pty()
        channel.exec_command(f"sudo bash -c \"{cmd_str}\" < /dev/null")
        start = time.time()
        password_sent = False
        output = b""
        while time.time() - start < timeout:
            if channel.recv_ready():
                output += channel.recv(4096)
            if not password_sent and b"password" in output.lower():
                channel.send(f"{password}\n")
                password_sent = True
            if channel.exit_status_ready():
                while channel.recv_ready():
                    output += channel.recv(4096)
                break
            time.sleep(0.1)
        return channel.recv_exit_status(), _strip_ansi(output).decode("utf-8", errors="replace")

    try:
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=password, timeout=timeout)
        # 用 < /dev/null 禁止 MOTD 混 stdin，避免命令解析出错
        ec, out = _exec(client, f"grep '^{user}:' /etc/passwd | cut -d: -f6 < /dev/null")
        client.close()
        if ec == 0 and out.strip():
            return out.strip()
    except Exception:
        pass
    if user == "root":
        return "/root"
    return f"/var/services/homes/{user}"


def check_key_in_remote(host: str, user: str, password: str, require_sudo: bool, timeout: int = 15) -> bool:
    """
    检测远程 authorized_keys 中是否已包含我们的公钥
    """
    _, pub_key = get_local_key()
    key_marker = pub_key.split()[1]  # 取公钥指纹部分用于匹配

    if require_sudo:
        try:
            import paramiko
        except ImportError:
            return False
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(hostname=host, username=user, password=password, timeout=timeout)

            # 获取用户 home 目录，避免 sudo bash -c 中 ~ 展开到 root
            user_home = _get_remote_user_home(host, user, password, timeout=10)
            # 防御: 验证是真实路径（非密码提示等）
            if not user_home.startswith('/') or 'password' in user_home.lower():
                user_home = f"/var/services/homes/{user}"
            ssh_dir = f"{user_home}/.ssh"
            cmd = f"grep -qF '{key_marker}' {ssh_dir}/authorized_keys 2>/dev/null && echo YES || echo NO"

            transport = client.get_transport()
            channel = transport.open_session()
            channel.get_pty()
            channel.exec_command(f"sudo bash -c \"{cmd}\" < /dev/null")
            start = time.time()
            password_sent = False
            output = b""
            while time.time() - start < timeout:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if not password_sent and b"password" in output.lower():
                    channel.send(f"{password}\n")
                    password_sent = True
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(4096)
                    break
                time.sleep(0.1)
            result = _strip_ansi(output).decode("utf-8", errors="replace")
            client.close()
            return "YES" in result
        except Exception:
            return False
    else:
        cmd = f"grep -qF '{key_marker}' ~/.ssh/authorized_keys 2>/dev/null && echo YES || echo NO"
        try:
            with _auth_file(password) as pass_file:
                r = subprocess.run(
                    ["sshpass", "-f", pass_file, "ssh", "-o", "StrictHostKeyChecking=no",
                     "-o", "ConnectTimeout=10", f"{user}@{host}", cmd],
                    capture_output=True, text=True, timeout=timeout
                )
            return "YES" in r.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False


def push_key_to_remote(host: str, user: str, password: str, require_sudo: bool, timeout: int = 30) -> bool:
    """
    推送本地公钥到远程 authorized_keys，首次连接时调用
    """
    _, pub_key = get_local_key()
    print(f"[INFO] 首次连接，正在推送 SSH 公钥到 {user}@{host}...")

    if require_sudo:
        return _push_key_paramiko(host, user, password, pub_key, timeout=timeout)
    else:
        return _push_key_sshcopyid(host, user, password, timeout=timeout)


def _push_key_sshcopyid(host: str, user: str, password: str, timeout: int = 30) -> bool:
    """ssh-copy-id 方式推送公钥（无 sudo）"""
    try:
        with _auth_file(password) as pass_file:
            r = subprocess.run(
                ["sshpass", "-f", pass_file, "ssh-copy-id", "-o", "StrictHostKeyChecking=no",
                 "-o", "ConnectTimeout=15", f"{user}@{host}"],
                capture_output=True, text=True, timeout=timeout
            )
        if r.returncode == 0:
            print(f"[INFO] 公钥推送成功，后续将使用密钥认证")
            return True
        print(f"[WARN] ssh-copy-id 失败（{r.stderr.strip()}），继续使用密码认证", file=sys.stderr)
        return False
    except FileNotFoundError:
        return False


def _strip_ansi(data: bytes) -> bytes:
    """去除 PTY 输出中的 ANSI 转义码（OpenWrt 等系统 MOTD 颜色码）"""
    import re
    text = data.decode("utf-8", errors="replace")
    text = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", text)
    return text.encode("utf-8", errors="replace")


def _strip_motd(text: str) -> str:
    """去除 SSH login shell 的 MOTD 欢迎信息"""
    import re
    # 先去掉 ANSI 码
    text = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", text)
    lines = []
    for l in text.split('\n'):
        s = l.strip()
        # 空行或纯 password 行跳过
        if not s or 'password' in s.lower():
            continue
        # 纯装饰边框行: ~~~ 或 === 或 --- 分隔线
        if s.startswith(('~~~', '===', '---')):
            continue
        # 纯符号行（~ | / \ _ - . 和空格）
        non_space = s.replace(' ', '')
        if non_space and all(c in '~|_-\\/.[].()[]{}' for c in non_space):
            continue
        # ASCII art 风格的 MOTD banner 行（如 \     /_/  W I R E L E S S）
        # 特征: 开头有 \ 后跟空格（OpenWrt 等系统 MOTD 格式）
        if re.match(r'^\\ +', s):
            continue
        # 常见欢迎/系统信息行
        lower = s.lower()
        if any(kw in lower for kw in [
                'wireless freedom', 'wireless  freedom', 'base on openwrt', 'kernel ',
                'platform:', 'soc:', 'board:', '设备信息', 'cpu 型号',
                '系统负载', '运行时间', '环境温度', '当前频率', '内存已用',
                '启动存储', '系统存储', '数据存储', 'plesk', 'ubuntu',
                'centos', 'debian', 'packaged by', 'boot device',
                'data storage']):
            continue
        lines.append(l)
    return '\n'.join(lines)


def _push_key_paramiko(host: str, user: str, password: str, pub_key: str, timeout: int = 30) -> bool:
    """paramiko + PTY 分步推送公钥（有 sudo）"""
    try:
        import paramiko
    except ImportError:
        return False

    import base64
    encoded = base64.b64encode(pub_key.encode()).decode()

    def _sudo_exec(client, cmd):
        """
        执行单条 sudo 命令，返回 (exit_code, output)，过滤 ANSI 码。
        先尝试无 PTY（OpenWrt passwordless sudo），失败则重试带 PTY（Synology 密码 sudo）。
        每个命令用独立 channel，执行完毕后关闭。
        """
        def _try_without_pty():
            transport = client.get_transport()
            channel = transport.open_session()
            channel.exec_command(f"sudo bash -c \"{cmd}\"")
            start = time.time()
            output = b""
            while time.time() - start < 20:
                if channel.recv_ready():
                    output += channel.recv(8192)
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(8192)
                    break
                time.sleep(0.1)
            result = _strip_ansi(output).decode("utf-8", errors="replace")
            ec = channel.recv_exit_status()
            channel.close()
            return ec, result

        def _try_with_pty():
            transport = client.get_transport()
            channel = transport.open_session()
            channel.get_pty()
            channel.exec_command(f"sudo bash -c \"{cmd}\"")
            start = time.time()
            password_sent = False
            output = b""
            while time.time() - start < 20:
                if channel.recv_ready():
                    output += channel.recv(8192)
                if not password_sent and b"password" in output.lower():
                    channel.send(f"{password}\n")
                    password_sent = True
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(8192)
                    break
                time.sleep(0.1)
            result = _strip_ansi(output).decode("utf-8", errors="replace")
            ec = channel.recv_exit_status()
            channel.close()
            return ec, result

        # 先试无 PTY（passwordless sudo）
        ec, out = _try_without_pty()
        if ec == 0:
            return ec, out
        # 失败则重试带 PTY（password sudo）
        return _try_with_pty()

    def _get_user_home(client, username):
        """获取用户 home 目录（适配 OpenWrt/Synology）"""
        ec, out = _sudo_exec(client, f"grep '^{username}:' /etc/passwd | cut -d: -f6")
        stripped = out.strip()
        # 过滤掉 sudo 密码提示等非路径内容，确保返回的是真实路径
        if ec == 0 and stripped and stripped.startswith('/') and 'password' not in stripped.lower():
            return stripped
        # fallback: root 在 OpenWrt 用 /root，其他用户用 /var/services/homes/<user>
        if username == "root":
            return "/root"
        return f"/var/services/homes/{username}"

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=password, timeout=timeout)

        user_home = _get_user_home(client, user)
        ssh_dir = f"{user_home}/.ssh"

        # Step 0: 创建 .hushlogin 禁止 MOTD（OpenWrt 等系统 MOTD 干扰命令输出）
        ec, _ = _sudo_exec(client, f"touch {user_home}/.hushlogin")

        # Step 1: 建立 .ssh 目录和 authorized_keys，设置权限
        ec, out = _sudo_exec(client, f"mkdir -p {ssh_dir} && chmod 700 {ssh_dir} && touch {ssh_dir}/authorized_keys && chmod 600 {ssh_dir}/authorized_keys")
        if ec != 0:
            print(f"[WARN] 设置 .ssh 目录失败: {out.strip()}", file=sys.stderr)
            client.close()
            return False

        # Step 2: 改属主（SSH 以该用户运行，需有读写权限）
        ec, out = _sudo_exec(client, f"chown -R {user}:users {ssh_dir}")
        if ec != 0:
            print(f"[WARN] 修改 .ssh 属主失败: {out.strip()}", file=sys.stderr)
            client.close()
            return False

        # Step 3: 追加公钥（用 base64 编码避免特殊字符问题）
        key_marker = pub_key.split()[1]
        ec, out = _sudo_exec(client, f"grep -qF '{key_marker}' {ssh_dir}/authorized_keys && echo EXISTS")
        if "EXISTS" in out:
            print(f"[INFO] 公钥已在 authorized_keys 中")
            client.close()
            return True

        ec, out = _sudo_exec(client, f"echo {encoded} | base64 -d >> {ssh_dir}/authorized_keys && echo >> {ssh_dir}/authorized_keys && echo PUSHED")
        _sudo_exec(client, f"chown {user}:users {ssh_dir}/authorized_keys")
        client.close()

        if "PUSHED" in out:
            print(f"[INFO] 公钥推送成功，后续将使用密钥认证")
            return True
        print(f"[WARN] 公钥追加失败: {out.strip()}", file=sys.stderr)
        return False

    except Exception as e:
        try:
            client.close()
        except Exception:
            pass
        print(f"[WARN] 公钥推送失败（{e}），继续使用密码认证", file=sys.stderr)
        return False


def get_conn_info(identifier):
    """兼容旧接口: 获取设备连接信息"""
    return ConfigLoader().get_connection(identifier)


def _get_local_ips():
    """获取本机 IP 列表"""
    ips = []
    try:
        result = subprocess.run(
            ['ipconfig', 'getiflist'], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            for iface in result.stdout.strip().split('\n'):
                if iface and iface != 'lo0':
                    addr = subprocess.run(
                        ['ipconfig', 'getifaddr', iface], capture_output=True, text=True, timeout=5
                    ).stdout.strip()
                    if addr:
                        ips.append(addr)
        if not ips:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
            s.close()
    except Exception:
        pass
    return ips


def _is_reachable(host, port=22, timeout=2.0):
    """检测主机是否可达"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))
        sock.close()
        return True
    except Exception:
        return False


def run_cmd(identifier, command, timeout=60):
    """
    执行远程命令 - 完全自适应

    auth_method (认证方式): auto(默认) | key | password
    exec_protocol (执行协议): auto(默认) | ssh | sshpass | paramiko
    """
    config = ConfigLoader()
    conn = config.get_connection(identifier)
    if not conn:
        print(f"[ERROR] 设备不存在: {identifier}", file=sys.stderr)
        return 1, ""

    host = conn['host']
    user = conn['user']
    password = conn['password']
    require_sudo = conn['require_sudo']
    key_file = conn.get('key_file')
    auth_method = conn.get('auth_method') or 'auto'
    exec_protocol = conn.get('exec_protocol') or 'auto'

    # 本机执行
    local_ips = _get_local_ips()
    is_local = host in local_ips or host == 'localhost' or host == '127.0.0.1'
    if is_local:
        r = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout + r.stderr

    # ---- exec_protocol 分发 ----
    if exec_protocol == 'paramiko':
        return _run_paramiko(host, user, password, command, require_sudo=require_sudo, timeout=timeout)
    if exec_protocol == 'sshpass':
        if not password:
            print(f"[ERROR] exec_protocol=sshpass 但未配置 password", file=sys.stderr)
            return 1, ""
        exit_code, out = _run_sshpass(host, user, password, command, timeout=timeout)
        if exit_code is not None:
            return exit_code, _strip_motd(out)
        return 1, "sshpass 执行失败"
    if exec_protocol not in ('auto', 'ssh'):
        print(f"[ERROR] 不支持的 exec_protocol: {exec_protocol}，支持: auto|ssh|sshpass|paramiko", file=sys.stderr)
        return 1, ""

    # ---- auth_method + 协议组合 ----
    # 强制 key auth
    if auth_method == 'key':
        kf = key_file
        if not kf:
            _, kf = get_local_key()
        if not kf:
            print(f"[ERROR] auth_method=key 但未配置 key_file 且本地无 SSH 密钥", file=sys.stderr)
            return 1, ""
        exit_code, out = _run_key_auth(host, user, kf, command, require_sudo=require_sudo, timeout=timeout)
        if exit_code is not None:
            return exit_code, _strip_motd(out)
        print(f"[ERROR] key auth 失败 (exit={exit_code})，auth_method=key 不回退到密码认证", file=sys.stderr)
        return 1, out

    # 强制 password auth
    if auth_method == 'password':
        if not password:
            print(f"[ERROR] auth_method=password 但未配置 password", file=sys.stderr)
            return 1, ""
        if require_sudo:
            return _run_paramiko(host, user, password, command, require_sudo=True, timeout=timeout)
        exit_code, out = _run_sshpass(host, user, password, command, timeout=timeout)
        if exit_code is not None:
            return exit_code, _strip_motd(out)
        return 1, "password auth 失败"

    # ---- auto 模式（原有逻辑）----
    # 1. 已配置 key_file
    if key_file:
        exit_code, out = _run_key_auth(host, user, key_file, command, require_sudo=False, timeout=timeout)
        if exit_code is not None:
            return exit_code, _strip_motd(out)

    # 2. 未配置 key_file，检测远程是否已有我们的公钥
    if not key_file and password:
        has_key = check_key_in_remote(host, user, password, require_sudo, timeout=15)
        if has_key:
            key_path, _ = get_local_key()
            exit_code, out = _run_key_auth(host, user, key_path, command, require_sudo=require_sudo, timeout=timeout)
            if exit_code is not None:
                return exit_code, _strip_motd(out)
        else:
            exit_code, out = _run_password_then_push_key(
                host, user, password, command, require_sudo, timeout=timeout
            )
            if exit_code is not None:
                return exit_code, _strip_motd(out)

    # 3. 密码兜底
    if require_sudo:
        return _run_paramiko(host, user, password, command, require_sudo=True, timeout=timeout)

    exit_code, out = _run_sshpass(host, user, password, command, timeout=timeout)
    if exit_code is not None:
        return exit_code, _strip_motd(out)

    ec, out = _run_paramiko(host, user, password, command, require_sudo=False, timeout=timeout)
    return ec, _strip_motd(out)


def upload_file(identifier, local_file, remote_path, timeout=600):
    """
    上传文件 - transfer_protocol 分发
    协议: auto(默认) | sftp | rsync | smb | ftp | base64
    """
    config = ConfigLoader()
    conn = config.get_connection(identifier)
    if not conn:
        print(f"[ERROR] 设备不存在: {identifier}", file=sys.stderr)
        return 1

    host = conn['host']
    user = conn['user']
    password = conn['password']
    require_sudo = conn['require_sudo']
    key_file = conn.get('key_file')
    transfer_protocol = conn.get('transfer_protocol') or 'auto'

    local_ips = _get_local_ips()
    is_local = host in local_ips or host == 'localhost' or host == '127.0.0.1'
    if is_local:
        import shutil
        shutil.copy(local_file, remote_path)
        print(f"[INFO] 复制 {local_file} -> {remote_path}")
        return 0

    local_path = Path(local_file)
    if not local_path.exists():
        print(f"[ERROR] 本地文件不存在: {local_file}", file=sys.stderr)
        return 1

    # ---- transfer_protocol 分发 ----
    if transfer_protocol == 'smb':
        return _upload_smb(conn, local_file, remote_path, timeout)
    if transfer_protocol == 'ftp' or transfer_protocol == 'ftps':
        return _upload_ftp(conn, local_file, remote_path, timeout)
    if transfer_protocol == 'base64':
        return _upload_cat_auto(conn, local_file, remote_path, timeout)
    if transfer_protocol == 'rsync':
        return _upload_rsync_auto(conn, local_file, remote_path, timeout)
    if transfer_protocol not in ('auto', 'sftp'):
        print(f"[ERROR] 不支持的 transfer_protocol: {transfer_protocol}，支持: auto|sftp|rsync|smb|ftp|base64", file=sys.stderr)
        return 1

    # ---- auto 模式（SFTP优先 → rsync → SMB → FTP → base64）----
    # 1. SFTP key auth
    resolved_key = key_file
    if not resolved_key:
        resolved_key, _ = get_local_key()
    if resolved_key:
        exit_code = _upload_sftp_key(host, user, resolved_key, local_file, remote_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 2. SFTP password
    exit_code = _upload_sftp(host, user, password, local_file, remote_path, timeout=timeout)
    if exit_code == 0:
        return 0

    # 3. rsync key
    if resolved_key:
        exit_code = _upload_rsync_key(host, user, resolved_key, local_file, remote_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 4. rsync password
    exit_code = _upload_rsync_password(host, user, password, local_file, remote_path, timeout=timeout)
    if exit_code == 0:
        return 0

    # 5. SMB
    if conn.get('smb_password') or password:
        exit_code = _upload_smb(conn, local_file, remote_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 6. FTP
    if conn.get('ftp_password') or password:
        exit_code = _upload_ftp(conn, local_file, remote_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 7. base64
    return _upload_cat_auto(conn, local_file, remote_path, timeout)


def download_file(identifier, remote_path, local_path, timeout=600):
    """
    下载文件 - transfer_protocol 分发
    协议: auto(默认) | sftp | rsync | smb | ftp | base64
    """
    config = ConfigLoader()
    conn = config.get_connection(identifier)
    if not conn:
        print(f"[ERROR] 设备不存在: {identifier}", file=sys.stderr)
        return 1

    host = conn['host']
    user = conn['user']
    password = conn['password']
    require_sudo = conn['require_sudo']
    key_file = conn.get('key_file')
    transfer_protocol = conn.get('transfer_protocol') or 'auto'

    local_ips = _get_local_ips()
    is_local = host in local_ips or host == 'localhost' or host == '127.0.0.1'
    if is_local:
        import shutil
        shutil.copy(remote_path, local_path)
        print(f"[INFO] 复制 {remote_path} -> {local_path}")
        return 0

    # ---- transfer_protocol 分发 ----
    if transfer_protocol == 'smb':
        return _download_smb(conn, remote_path, local_path, timeout)
    if transfer_protocol == 'ftp' or transfer_protocol == 'ftps':
        return _download_ftp(conn, remote_path, local_path, timeout)
    if transfer_protocol == 'base64':
        return _download_base64_auto(conn, remote_path, local_path, timeout)
    if transfer_protocol == 'rsync':
        return _download_rsync_auto(conn, remote_path, local_path, timeout)
    if transfer_protocol not in ('auto', 'sftp'):
        print(f"[ERROR] 不支持的 transfer_protocol: {transfer_protocol}，支持: auto|sftp|rsync|smb|ftp|base64", file=sys.stderr)
        return 1

    # ---- auto 模式（rsync优先 → SFTP → SMB → FTP → base64）----
    # 1. rsync key
    resolved_key = key_file
    if not resolved_key:
        resolved_key, _ = get_local_key()
    if resolved_key:
        exit_code = _download_rsync_key(host, user, resolved_key, remote_path, local_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 2. rsync password
    exit_code = _download_rsync_password(host, user, password, remote_path, local_path, timeout=timeout)
    if exit_code == 0:
        return 0

    # 3. SFTP key
    if resolved_key:
        exit_code = _download_sftp_key(host, user, resolved_key, remote_path, local_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 4. SFTP password
    exit_code = _download_sftp(host, user, password, remote_path, local_path, timeout=timeout)
    if exit_code == 0:
        return 0

    # 5. SMB
    if conn.get('smb_password') or password:
        exit_code = _download_smb(conn, remote_path, local_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 6. FTP
    if conn.get('ftp_password') or password:
        exit_code = _download_ftp(conn, remote_path, local_path, timeout=timeout)
        if exit_code == 0:
            return 0

    # 7. base64
    return _download_base64_auto(conn, remote_path, local_path, timeout)


# ---- 内部实现 ----

def _run_key_auth(host, user, key_file, command, require_sudo, timeout=60):
    """
    密钥认证执行，失败返回 (None, '')，成功返回 (code, out)

    注意: sudo 场景下 sudo 可能需要密码，subprocess SSH 无法交互提供密码。
    此时返回 (None, '') 触发回退到 paramiko（支持 PTY 发密码）。
    """
    try:
        if require_sudo:
            # sudo 需要密码时 subprocess 无法提供，回退到 paramiko
            return None, ""
        cmd = f"bash -l -c '{command}' 2>/dev/null"
        r = subprocess.run(
            ["ssh", "-i", key_file, "-o", "StrictHostKeyChecking=no",
             "-o", "ConnectTimeout=15", f"{user}@{host}", cmd],
            capture_output=True, text=True, timeout=timeout
        )
        if r.returncode == 255:
            return None, ""
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except Exception as e:
        return None, str(e)


def _run_password_then_push_key(host, user, password, command, require_sudo, timeout=60):
    """
    用密码登录执行命令，同时尝试推送公钥
    成功返回 (code, out)，失败返回 (None, '')
    """
    if require_sudo:
        exit_code, out = _run_paramiko(host, user, password, command, require_sudo=True, timeout=timeout)
    else:
        exit_code, out = _run_sshpass(host, user, password, command, timeout=timeout)
        if exit_code is None:
            return None, ""

    # 登录成功，推送公钥（后台，不阻塞主流程）
    push_key_to_remote(host, user, password, require_sudo, timeout=30)

    return exit_code, out


def _run_sshpass(host, user, password, command, timeout=60):
    """sshpass 执行，失败返回 (None, '')，成功返回 (code, out)"""
    try:
        with _auth_file(password) as pass_file:
            r = subprocess.run(
                ['sshpass', '-f', pass_file, 'ssh', '-o', 'StrictHostKeyChecking=no',
                 f'{user}@{host}', command],
                capture_output=True, text=True, timeout=timeout
            )
        return r.returncode, r.stdout + r.stderr
    except FileNotFoundError:
        return None, ""
    except Exception as e:
        return None, str(e)


def _run_paramiko(host, user, password, command, require_sudo, timeout=60):
    """paramiko 执行，含 pty sudo 支持"""
    try:
        import paramiko
    except ImportError:
        print("[ERROR] paramiko 未安装", file=sys.stderr)
        return 1, ""

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=password, timeout=timeout)

        if require_sudo:
            cmd = f"sudo env PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash -c '{command}'"
        else:
            cmd = f"bash -l -c '{command}'"

        transport = client.get_transport()
        channel = transport.open_session()
        # PTY 仅在需要交互输入时启用（sudo password prompt）
        if require_sudo:
            channel.get_pty()
        channel.exec_command(cmd)

        start = time.time()
        password_sent = False
        output = b""
        while time.time() - start < timeout:
            if channel.recv_ready():
                output += channel.recv(8192)
            if require_sudo and not password_sent and b"password" in output.lower():
                channel.send(f"{password}\n")
                password_sent = True
            if channel.exit_status_ready():
                while channel.recv_ready():
                    output += channel.recv(8192)
                break
            time.sleep(0.1)

        stdout = _strip_ansi(output).decode('utf-8', errors='replace')

        def _is_motd_line(l):
            """过滤 MOTD 欢迎信息行（~ === 分隔线 / 路由设备信息行）"""
            s = l.strip()
            if not s:
                return False
            # 纯装饰边框行: ~~~ 或 === 分隔线
            if s.startswith('~~~') or s.startswith('===') or s.startswith('---'):
                return True
            # 纯字母数字+符号的欢迎/版本信息行
            if s.startswith('Welcome') or 'OpenWrt' in s or 'LEDE' in s:
                return True
            # 纯符号组成的行（~ | / \ _ - . 和空格）
            non_space = s.replace(' ', '')
            if non_space and all(c in '~|_-\\/.[].()[]{}' for c in non_space):
                return True
            return False

        lines = [l for l in stdout.split('\n')
                 if 'password' not in l.lower()
                 and l.strip()
                 and not _is_motd_line(l)]
        exit_code = channel.recv_exit_status()
        client.close()
        return exit_code, '\n'.join(lines)

    except Exception as e:
        return 1, str(e)


def _upload_sftp_key(host, user, key_file, local_file, remote_path, timeout=600):
    """SFTP 上传（密钥认证）via OpenSSH sftp batch mode"""
    try:
        r = subprocess.run(
            ["sftp", "-i", key_file, "-o", "StrictHostKeyChecking=no",
             "-o", "ConnectTimeout=15",
             "-b", "-", f"{user}@{host}"],
            input=f"put {local_file} {remote_path}\nquit\n",
            capture_output=True, text=True, timeout=timeout
        )
        if r.returncode == 0:
            print(f"[INFO] SFTP 上传(key): {local_file} -> {remote_path}")
        else:
            print(f"[WARN] SFTP 上传(key) 失败: {r.stderr.strip()}", file=sys.stderr)
        return r.returncode
    except FileNotFoundError:
        print(f"[WARN] SFTP 上传(key) 失败: sftp 命令未找到", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"[WARN] SFTP 上传(key) 失败: {e}，回退到其他方式", file=sys.stderr)
        return 1


def _upload_cat_key(host, user, key_file, local_file, remote_path, require_sudo=False, password="", timeout=600):
    """cat+base64 上传（密钥认证，require_sudo=True 时需 PTY 发送 sudo 密码）"""
    try:
        import paramiko
    except ImportError:
        return 1

    try:
        with open(local_file, 'rb') as f:
            encoded = base64.b64encode(f.read()).decode()

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=None, key_filename=key_file, timeout=timeout)

        transport = client.get_transport()
        channel = transport.open_session()
        if require_sudo:
            channel.get_pty()
        channel.exec_command(f"echo '{encoded}' | base64 -d | sudo tee {remote_path} > /dev/null")

        if require_sudo:
            # 动态检测密码提示再发送
            password_sent = False
            output = b""
            deadline = time.time() + 20
            while time.time() < deadline:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if not password_sent and b"password" in output.lower():
                    channel.send(f"{password}\n")
                    password_sent = True
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(4096)
                    break
                time.sleep(0.1)
        else:
            output = b""
            while True:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if channel.exit_status_ready():
                    break
                time.sleep(0.1)

        exit_code = channel.recv_exit_status()
        channel.close()
        client.close()
        if exit_code == 0:
            print(f"[INFO] 上传成功: {local_file} -> {remote_path} (key)")
        return exit_code
    except Exception as e:
        print(f"[WARN] cat key 上传失败: {e}，回退到密码方式", file=sys.stderr)
        return 1


def _upload_sftp(host, user, password, local_file, remote_path, timeout=600):
    try:
        import paramiko
    except ImportError:
        return 1

    try:
        transport = paramiko.Transport((host, 22))
        transport.connect(username=user, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        sftp.put(local_file, remote_path)
        sftp.close()
        transport.close()
        print(f"[INFO] 上传 {local_file} -> {user}@{host}:{remote_path}")
        return 0
    except Exception as e:
        print(f"[ERROR] SFTP 上传失败: {e}", file=sys.stderr)
        return 1


def _upload_cat(host, user, password, local_file, remote_path, require_sudo=False, timeout=600):
    try:
        import paramiko
    except ImportError:
        return 1

    try:
        with open(local_file, 'rb') as f:
            encoded = base64.b64encode(f.read()).decode()

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=password, timeout=timeout)

        if require_sudo:
            transport = client.get_transport()
            channel = transport.open_session()
            channel.get_pty()
            channel.exec_command(f"echo '{encoded}' | base64 -d | sudo tee {remote_path} > /dev/null")
            # 动态检测密码提示再发送
            password_sent = False
            output = b""
            deadline = time.time() + 20
            while time.time() < deadline:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if not password_sent and b"password" in output.lower():
                    channel.send(f"{password}\n")
                    password_sent = True
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(4096)
                    break
                time.sleep(0.1)
            exit_code = channel.recv_exit_status()
            channel.close()
        else:
            stdin, stdout, stderr = client.exec_command(f"echo '{encoded}' | base64 -d > {remote_path}")
            exit_code = stdout.channel.recv_exit_status()
            if exit_code != 0:
                print(stderr.read().decode(), file=sys.stderr)

        client.close()
        if exit_code == 0:
            print(f"[INFO] 上传成功: {local_file} -> {remote_path}")
        return exit_code

    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


def _download_scp_key(host, user, key_file, remote_path, local_path, timeout=600):
    """SCP 下载（密钥认证）"""
    try:
        r = subprocess.run(
            ["scp", "-i", key_file, "-o", "StrictHostKeyChecking=no",
             f"{user}@{host}:{remote_path}", local_path],
            capture_output=True, text=True, timeout=timeout
        )
        if r.returncode == 0:
            print(f"[INFO] 下载成功: {remote_path} -> {local_path} (key)")
        else:
            print(f"[WARN] SCP key 失败: {r.stderr.strip()}，回退到其他方式", file=sys.stderr)
        return r.returncode
    except subprocess.TimeoutExpired:
        return 1
    except Exception as e:
        print(f"[WARN] SCP key 失败: {e}，回退到其他方式", file=sys.stderr)
        return 1


def _download_scp(host, user, password, remote_path, local_path, timeout=600):
    try:
        with _auth_file(password) as pass_file:
            r = subprocess.run(
                ['sshpass', '-f', pass_file, 'scp', '-o', 'StrictHostKeyChecking=no',
                 f'{user}@{host}:{remote_path}', local_path],
                capture_output=True, text=True, timeout=timeout
            )
        if r.returncode == 0:
            print(f"[INFO] 下载成功: {remote_path} -> {local_path}")
        else:
            print(f"[ERROR] SCP 失败: {r.stderr}", file=sys.stderr)
        return r.returncode
    except FileNotFoundError:
        return 1
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


def _download_base64(host, user, password, remote_path, local_path, require_sudo, timeout=600):
    try:
        import paramiko
    except ImportError:
        return 1

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=password, timeout=timeout)

        read_cmd = f"sudo bash -c 'base64 \"{remote_path}\"'" if require_sudo else f"base64 '{remote_path}'"

        if require_sudo:
            transport = client.get_transport()
            channel = transport.open_session()
            channel.get_pty()
            channel.exec_command(read_cmd)
            # 动态检测密码提示再发送
            password_sent = False
            output = b""
            deadline = time.time() + 20
            while time.time() < deadline:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if not password_sent and b"password" in output.lower():
                    channel.send(f"{password}\n")
                    password_sent = True
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(4096)
                    break
                time.sleep(0.1)
            content = output.decode('utf-8', errors='replace')
            exit_code = channel.recv_exit_status()
            channel.close()
        else:
            stdin, stdout, stderr = client.exec_command(read_cmd)
            content = stdout.read().decode('utf-8', errors='replace')
            exit_code = stdout.channel.recv_exit_status()

        client.close()

        if exit_code != 0:
            print(f"[ERROR] 读取远程文件失败", file=sys.stderr)
            return 1

        lines = [l for l in content.split('\n') if 'Password' not in l and l.strip()]
        encoded = ''.join(lines)
        decoded = base64.b64decode(encoded)
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, 'wb') as f:
            f.write(decoded)
        print(f"[INFO] 下载成功: {remote_path} -> {local_path}")
        return 0

    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


# ==================== rsync 传输 ====================

def _ssh_cmd_key(host, user, key_file):
    return f"ssh -i {key_file} -o StrictHostKeyChecking=no -o ConnectTimeout=15"

def _upload_rsync_key(host, user, key_file, local_file, remote_path, timeout=600):
    ssh_e = _ssh_cmd_key(host, user, key_file)
    cmd = ["rsync", "-av", "-e", ssh_e, local_file, f"{user}@{host}:{remote_path}"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode == 0:
        print(f"[INFO] rsync 上传(key): {local_file} -> {remote_path}")
    else:
        print(f"[ERROR] rsync 上传失败: {r.stderr.strip()}", file=sys.stderr)
    return r.returncode

def _upload_rsync_password(host, user, password, local_file, remote_path, timeout=600):
    try:
        ssh_e = f"sshpass -p '{password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15"
        cmd = ["rsync", "-av", "-e", ssh_e, local_file, f"{user}@{host}:{remote_path}"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if r.returncode == 0:
            print(f"[INFO] rsync 上传(password): {local_file} -> {remote_path}")
        else:
            print(f"[ERROR] rsync 上传失败: {r.stderr.strip()}", file=sys.stderr)
        return r.returncode
    except Exception as e:
        print(f"[ERROR] rsync 上传失败: {e}", file=sys.stderr)
        return 1

def _upload_rsync_auto(conn, local_file, remote_path, timeout=600):
    host = conn['host']; user = conn['user']; password = conn['password']
    key_file = conn.get('key_file')
    kf = key_file
    if not kf:
        kf, _ = get_local_key()
    if kf:
        ec = _upload_rsync_key(host, user, kf, local_file, remote_path, timeout)
        if ec == 0:
            return 0
    if password:
        return _upload_rsync_password(host, user, password, local_file, remote_path, timeout)
    print(f"[ERROR] rsync 上传失败: 未配置 key_file 或 password", file=sys.stderr)
    return 1

def _download_rsync_key(host, user, key_file, remote_path, local_path, timeout=600):
    ssh_e = _ssh_cmd_key(host, user, key_file)
    cmd = ["rsync", "-av", "-e", ssh_e, f"{user}@{host}:{remote_path}", local_path]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode == 0:
        print(f"[INFO] rsync 下载(key): {remote_path} -> {local_path}")
    else:
        print(f"[ERROR] rsync 下载失败: {r.stderr.strip()}", file=sys.stderr)
    return r.returncode

def _download_rsync_password(host, user, password, remote_path, local_path, timeout=600):
    try:
        ssh_e = f"sshpass -p '{password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15"
        cmd = ["rsync", "-av", "-e", ssh_e, f"{user}@{host}:{remote_path}", local_path]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if r.returncode == 0:
            print(f"[INFO] rsync 下载(password): {remote_path} -> {local_path}")
        else:
            print(f"[ERROR] rsync 下载失败: {r.stderr.strip()}", file=sys.stderr)
        return r.returncode
    except Exception as e:
        print(f"[ERROR] rsync 下载失败: {e}", file=sys.stderr)
        return 1

def _download_rsync_auto(conn, remote_path, local_path, timeout=600):
    host = conn['host']; user = conn['user']; password = conn['password']
    key_file = conn.get('key_file')
    kf = key_file
    if not kf:
        kf, _ = get_local_key()
    if kf:
        ec = _download_rsync_key(host, user, kf, remote_path, local_path, timeout)
        if ec == 0:
            return 0
    if password:
        return _download_rsync_password(host, user, password, remote_path, local_path, timeout)
    print(f"[ERROR] rsync 下载失败: 未配置 key_file 或 password", file=sys.stderr)
    return 1


# ==================== SMB 传输 ====================

def _smb_strip_share(remote_path, share):
    """从路径中去掉 share 前缀: /volume1/download/foo -> /foo"""
    marker = f"/{share}/"
    idx = remote_path.find(marker)
    if idx >= 0:
        return "/" + remote_path[idx + len(marker):]
    if remote_path.endswith(f"/{share}"):
        return "/"
    return remote_path


def _upload_smb(conn, local_file, remote_path, timeout=600):
    host = conn.get('smb_host') or conn['host']
    user = conn.get('smb_user') or conn['user']
    pw = conn.get('smb_password') or conn['password']
    share = conn.get('smb_share') or 'volume1'
    if not pw:
        print(f"[ERROR] SMB 上传失败: 未配置 smb_password", file=sys.stderr)
        return 1
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        print(f"[ERROR] SMB 上传失败: pysmb 未安装 (pip install pysmb)", file=sys.stderr)
        return 1
    try:
        conn_smb = SMBConnection(user, pw, "claude-code", host, use_ntlm_v2=True)
        conn_smb.connect(host, 445, timeout=30)
        path = _smb_strip_share(remote_path, share)
        with open(local_file, 'rb') as f:
            conn_smb.storeFile(share, path, f)
        conn_smb.close()
        print(f"[INFO] SMB 上传: {local_file} -> //{host}/{share}{path}")
        return 0
    except Exception as e:
        print(f"[ERROR] SMB 上传失败: {e}", file=sys.stderr)
        return 1


def _download_smb(conn, remote_path, local_path, timeout=600):
    host = conn.get('smb_host') or conn['host']
    user = conn.get('smb_user') or conn['user']
    pw = conn.get('smb_password') or conn['password']
    share = conn.get('smb_share') or 'volume1'
    if not pw:
        print(f"[ERROR] SMB 下载失败: 未配置 smb_password", file=sys.stderr)
        return 1
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        print(f"[ERROR] SMB 下载失败: pysmb 未安装 (pip install pysmb)", file=sys.stderr)
        return 1
    try:
        conn_smb = SMBConnection(user, pw, "claude-code", host, use_ntlm_v2=True)
        conn_smb.connect(host, 445, timeout=30)
        path = _smb_strip_share(remote_path, share)
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, 'wb') as f:
            conn_smb.retrieveFile(share, path, f)
        conn_smb.close()
        print(f"[INFO] SMB 下载: //{host}/{share}{path} -> {local_path}")
        return 0
    except Exception as e:
        print(f"[ERROR] SMB 下载失败: {e}", file=sys.stderr)
        return 1


# ==================== FTP/FTPS 传输 ====================

def _upload_ftp(conn, local_file, remote_path, timeout=600):
    try:
        import ftputil
    except ImportError:
        print(f"[ERROR] FTP 上传失败: ftputil 未安装 (pip install ftputil)", file=sys.stderr)
        return 1
    host = conn.get('ftp_host') or conn['host']
    user = conn.get('ftp_user') or conn['user']
    pw = conn.get('ftp_password') or conn['password']
    port = conn.get('ftp_port') or 21
    use_tls = conn.get('ftp_tls', True)
    if not pw:
        print(f"[ERROR] FTP 上传失败: 未配置 ftp_password", file=sys.stderr)
        return 1
    try:
        factory = ftputil.session.session_factory(port=port)
        session = ftputil.FTPHost(host, user, pw, session_factory=factory)
        session.upload(local_file, remote_path)
        session.close()
        print(f"[INFO] FTP 上传: {local_file} -> {remote_path}")
        return 0
    except Exception as e:
        print(f"[ERROR] FTP 上传失败: {e}", file=sys.stderr)
        return 1

def _download_ftp(conn, remote_path, local_path, timeout=600):
    try:
        import ftputil
    except ImportError:
        print(f"[ERROR] FTP 下载失败: ftputil 未安装", file=sys.stderr)
        return 1
    host = conn.get('ftp_host') or conn['host']
    user = conn.get('ftp_user') or conn['user']
    pw = conn.get('ftp_password') or conn['password']
    port = conn.get('ftp_port') or 21
    if not pw:
        print(f"[ERROR] FTP 下载失败: 未配置 ftp_password", file=sys.stderr)
        return 1
    try:
        factory = ftputil.session.session_factory(port=port)
        session = ftputil.FTPHost(host, user, pw, session_factory=factory)
        session.download(remote_path, local_path)
        session.close()
        print(f"[INFO] FTP 下载: {remote_path} -> {local_path}")
        return 0
    except Exception as e:
        print(f"[ERROR] FTP 下载失败: {e}", file=sys.stderr)
        return 1


# ==================== base64 / cat 自动认证 ====================

def _upload_cat_auto(conn, local_file, remote_path, timeout=600):
    host = conn['host']; user = conn['user']; password = conn['password']
    key_file = conn.get('key_file'); require_sudo = conn['require_sudo']
    kf = key_file
    if not kf:
        kf, _ = get_local_key()
    if kf:
        ec = _upload_cat_key(host, user, kf, local_file, remote_path, require_sudo=require_sudo, password=password, timeout=timeout)
        if ec == 0:
            return 0
    return _upload_cat(host, user, password, local_file, remote_path, require_sudo=require_sudo, timeout=timeout)

def _download_base64_auto(conn, remote_path, local_path, timeout=600):
    host = conn['host']; user = conn['user']; password = conn['password']
    require_sudo = conn['require_sudo']; key_file = conn.get('key_file')
    kf = key_file
    if not kf:
        kf, _ = get_local_key()
    if kf:
        ec = _download_base64_key(host, user, kf, remote_path, local_path, require_sudo=require_sudo, password=password, timeout=timeout)
        if ec == 0:
            return 0
    return _download_base64_password(host, user, password, remote_path, local_path, require_sudo, timeout)


# ==================== SFTP 下载 ====================

def _download_sftp_key(host, user, key_file, remote_path, local_path, timeout=600):
    """SFTP 下载（密钥认证）via OpenSSH sftp batch mode"""
    try:
        r = subprocess.run(
            ["sftp", "-i", key_file, "-o", "StrictHostKeyChecking=no",
             "-o", "ConnectTimeout=15",
             "-b", "-", f"{user}@{host}"],
            input=f"get {remote_path} {local_path}\nquit\n",
            capture_output=True, text=True, timeout=timeout
        )
        if r.returncode == 0:
            print(f"[INFO] SFTP 下载(key): {remote_path} -> {local_path}")
        else:
            print(f"[WARN] SFTP 下载(key) 失败: {r.stderr.strip()}", file=sys.stderr)
        return r.returncode
    except FileNotFoundError:
        print(f"[WARN] SFTP 下载(key) 失败: sftp 命令未找到", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"[WARN] SFTP 下载(key) 失败: {e}，回退到其他方式", file=sys.stderr)
        return 1

def _download_sftp(host, user, password, remote_path, local_path, timeout=600):
    try:
        import paramiko
    except ImportError:
        return 1
    try:
        transport = paramiko.Transport((host, 22))
        transport.connect(username=user, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        sftp.get(remote_path, local_path)
        sftp.close()
        transport.close()
        print(f"[INFO] SFTP 下载(password): {remote_path} -> {local_path}")
        return 0
    except Exception as e:
        print(f"[ERROR] SFTP 下载失败: {e}", file=sys.stderr)
        return 1


# ==================== base64 key/password 下载 ====================

def _download_base64_key(host, user, key_file, remote_path, local_path, require_sudo, password="", timeout=600):
    try:
        import paramiko
    except ImportError:
        return 1
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=user, password=None, key_filename=key_file, timeout=timeout)
        read_cmd = f"sudo bash -c 'base64 \"{remote_path}\"'" if require_sudo else f"base64 '{remote_path}'"
        transport = client.get_transport()
        channel = transport.open_session()
        if require_sudo:
            channel.get_pty()
        channel.exec_command(read_cmd)
        if require_sudo:
            password_sent = False
            output = b""
            deadline = time.time() + 20
            while time.time() < deadline:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if not password_sent and b"password" in output.lower():
                    channel.send(f"{password}\n")
                    password_sent = True
                if channel.exit_status_ready():
                    while channel.recv_ready():
                        output += channel.recv(4096)
                    break
                time.sleep(0.1)
        else:
            output = b""
            while True:
                if channel.recv_ready():
                    output += channel.recv(4096)
                if channel.exit_status_ready():
                    break
                time.sleep(0.1)
        content = output.decode('utf-8', errors='replace')
        exit_code = channel.recv_exit_status()
        channel.close()
        client.close()
        if exit_code != 0:
            print(f"[ERROR] 读取远程文件失败 (exit={exit_code})", file=sys.stderr)
            return 1
        lines = [l for l in content.split('\n') if 'Password' not in l and l.strip()]
        encoded = ''.join(lines)
        decoded = base64.b64decode(encoded)
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, 'wb') as f:
            f.write(decoded)
        print(f"[INFO] base64 下载(key): {remote_path} -> {local_path}")
        return 0
    except Exception as e:
        print(f"[ERROR] base64 下载(key) 失败: {e}", file=sys.stderr)
        return 1

def _download_base64_password(host, user, password, remote_path, local_path, require_sudo, timeout=600):
    return _download_base64(host, user, password, remote_path, local_path, require_sudo, timeout)
