#!/usr/bin/env python3
"""
设备配置管理与IP选择
"""

import os
import re
import socket
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class DeviceConnection:
    """设备连接配置"""
    host: Optional[str] = None
    zerotier_host: Optional[str] = None
    tailscale_host: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None
    require_sudo: bool = True
    key_file: Optional[str] = None
    # 认证 & 协议选择
    auth_method: Optional[str] = None    # auto | key | password
    exec_protocol: Optional[str] = None    # auto | ssh | sshpass | paramiko
    transfer_protocol: Optional[str] = None  # auto | sftp | rsync | smb | ftp | base64
    # SMB 配置
    smb_host: Optional[str] = None
    smb_user: Optional[str] = None
    smb_password: Optional[str] = None
    smb_share: Optional[str] = None
    # 跳板机配置
    jump_host: Optional[str] = None
    jump_port: Optional[int] = None
    jump_user: Optional[str] = None
    jump_password: Optional[str] = None
    jump_host_2: Optional[str] = None
    jump_port_2: Optional[int] = None
    jump_user_2: Optional[str] = None
    jump_password_2: Optional[str] = None
    # FTP 配置
    ftp_host: Optional[str] = None
    ftp_user: Optional[str] = None
    ftp_password: Optional[str] = None
    ftp_port: Optional[int] = None
    ftp_tls: bool = True
    ftp_passive: bool = True


@dataclass
class Application:
    """应用配置"""
    name: str
    port: Optional[int] = None
    url: Optional[str] = None
    enabled: bool = True
    container_name: Optional[str] = None
    path: Optional[str] = None  # docker 目录路径


@dataclass
class Device:
    """设备配置"""
    name: str
    connection: DeviceConnection
    type: str = "generic"
    aliases: List[str] = None
    applications: Dict[str, Application] = None

    def __post_init__(self):
        if self.applications is None:
            self.applications = {}
        if self.aliases is None:
            self.aliases = []


class ConfigLoader:
    """配置加载器"""

    # 类级别缓存: {identifier: (ip, timestamp)}
    _ip_cache: Dict[str, tuple] = {}
    _cache_ttl: int = 3600  # 缓存有效期 1 小时
    _cache_file: Path = None  # 缓存文件路径

    @classmethod
    def _get_cache_file(cls) -> Path:
        """获取缓存文件路径"""
        if cls._cache_file is None:
            base_dir = Path(__file__).parent.parent.parent.parent.parent.parent
            cls._cache_file = base_dir / ".cache" / "device_ip.json"
        return cls._cache_file

    @classmethod
    def _load_cache(cls):
        """从文件加载缓存"""
        cache_file = cls._get_cache_file()
        if not cache_file.exists():
            return
        try:
            import json
            with open(cache_file, 'r') as f:
                data = json.load(f)
            # {key: [ip, timestamp]}
            cls._ip_cache = {k: tuple(v) for k, v in data.items()}
        except Exception:
            pass

    @classmethod
    def _save_cache(cls):
        """保存缓存到文件"""
        cache_file = cls._get_cache_file()
        try:
            import json
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            # {key: [ip, timestamp]} - JSON 不支持 tuple
            data = {k: list(v) for k, v in cls._ip_cache.items()}
            with open(cache_file, 'w') as f:
                json.dump(data, f)
        except Exception:
            pass

    def __init__(self, config_path: Optional[Path] = None):
        """
        初始化配置加载器

        Args:
            config_path: 配置文件路径，默认为 devices.yaml
        """
        if config_path is None:
            # 查找配置文件: lib -> scripts -> ssh-tools -> skills -> .claude -> 项目根目录
            base_dir = Path(__file__).parent.parent.parent.parent.parent.parent
            config_path = base_dir / "config.yaml"

        self.config_path = config_path
        self.config: Dict[str, Any] = {}
        self._load()
        ConfigLoader._load_cache()  # 加载 IP 缓存

    def _load(self):
        """加载配置文件"""
        import yaml
        if not self.config_path.exists():
            return

        with open(self.config_path, 'r', encoding='utf-8') as f:
            self.config = yaml.safe_load(f) or {}

    def _interpolate(self, value: str) -> str:
        """环境变量替换"""
        if not isinstance(value, str):
            return value

        pattern = re.compile(r'\$\{([^}]+)\}')

        def replace(match):
            var_name = match.group(1)
            # 支持默认值 ${VAR:-default}
            if ':-' in var_name:
                var_name, default = var_name.split(':-', 1)
                return os.environ.get(var_name, default)
            return os.environ.get(var_name, match.group(0))

        return pattern.sub(replace, value)

    def _process_value(self, value: Any) -> Any:
        """递归处理值"""
        if isinstance(value, dict):
            return {k: self._process_value(v) for k, v in value.items()}
        elif isinstance(value, list):
            return [self._process_value(item) for item in value]
        elif isinstance(value, str):
            return self._interpolate(value)
        return value

    def get_devices(self) -> Dict[str, Device]:
        """获取所有设备"""
        devices = {}

        # 新格式: devices[*] 直接包含连接信息
        devices_data = self.config.get('devices', {})

        for name, data in devices_data.items():
            # 跳过 YAML anchor 定义
            if name.startswith('_'):
                continue
            data = self._process_value(data)

            # 直接包含连接信息（无 connection 子键）
            conn_data = data

            connection = DeviceConnection(
                host=conn_data.get('host'),
                zerotier_host=conn_data.get('zerotier_host'),
                tailscale_host=conn_data.get('tailscale_host'),
                user=conn_data.get('user'),
                password=conn_data.get('password'),
                require_sudo=conn_data.get('require_sudo', True),
                key_file=conn_data.get('key_file'),
                auth_method=conn_data.get('auth_method'),
                exec_protocol=conn_data.get('exec_protocol'),
                transfer_protocol=conn_data.get('transfer_protocol'),
                smb_host=conn_data.get('smb_host'),
                smb_user=conn_data.get('smb_user'),
                smb_password=conn_data.get('smb_password'),
                smb_share=conn_data.get('smb_share'),
                ftp_host=conn_data.get('ftp_host'),
                ftp_user=conn_data.get('ftp_user'),
                ftp_password=conn_data.get('ftp_password'),
                ftp_port=conn_data.get('ftp_port'),
                ftp_tls=conn_data.get('ftp_tls', True),
                ftp_passive=conn_data.get('ftp_passive', True),
            )

            apps = {}
            for app_name, app_data in data.get('applications', {}).items():
                apps[app_name] = Application(
                    name=app_name,
                    port=app_data.get('port'),
                    url=app_data.get('url'),
                    enabled=app_data.get('enabled', True),
                    container_name=app_data.get('container_name', app_name),
                    path=app_data.get('path')
                )

            devices[name] = Device(
                name=name,
                connection=connection,
                type=data.get('type', 'generic'),
                aliases=data.get('alias', []) or data.get('aliases', []),
                applications=apps
            )

        return devices

    def get_device(self, name: str) -> Optional[Device]:
        """获取指定设备"""
        return self.get_devices().get(name)

    def find_device(self, identifier: str, prefer_zerotier: bool = True) -> Optional[Device]:
        """
        通过名称/别名/IP查找设备

        Args:
            identifier: 设备名、别名或IP
            prefer_zerotier: 是否优先使用 Zerotier IP (默认 True)

        Returns:
            设备对象，未找到返回 None
        """
        devices = self.get_devices()

        # 1. 按名称精确匹配
        if identifier in devices:
            return devices[identifier]

        # 2. 按别名匹配
        for device in devices.values():
            aliases = getattr(device, 'aliases', [])
            if identifier in aliases:
                return device

        # 3. 按 IP 匹配
        for device in devices.values():
            conn = device.connection
            if conn.host == identifier or conn.zerotier_host == identifier:
                return device

        return None

    def get_device_ip(self, identifier: str, prefer_zerotier: bool = True, use_cache: bool = True) -> Optional[str]:
        """
        获取设备的唯一连接 IP
        选择顺序: LAN → TailScale → Zerotier
        只缓存可达的 IP；全部不可达时返回 None
        """
        import time

        cache_key = f"{identifier}:{prefer_zerotier}"
        if use_cache and cache_key in self._ip_cache:
            cached_ip, cached_time = self._ip_cache[cache_key]
            if time.time() - cached_time < self._cache_ttl:
                return cached_ip

        device = self.find_device(identifier, prefer_zerotier)
        if not device:
            return None

        conn = device.connection
        candidates = [conn.host, conn.tailscale_host, conn.zerotier_host]
        selected_ip = next((ip for ip in candidates if ip and self._is_reachable(ip)), None)

        if selected_ip:
            self._ip_cache[cache_key] = (selected_ip, time.time())
            ConfigLoader._save_cache()
            return selected_ip

        # 无可达 IP，清除该设备的缓存条目
        if cache_key in self._ip_cache:
            del self._ip_cache[cache_key]
            ConfigLoader._save_cache()
        return None

    def _is_reachable(self, host: str, port: int = 22, timeout: float = 2.0) -> bool:
        """检测主机是否可达"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((host, port))
            sock.close()
            return True
        except Exception:
            return False

    @classmethod
    def clear_ip_cache(cls):
        """清除 IP 缓存"""
        cls._ip_cache.clear()
        cache_file = cls._get_cache_file()
        if cache_file.exists():
            cache_file.unlink()

    def get_device_credentials(self, identifier: str) -> Dict:
        """获取设备凭证"""
        conn_dict = self.get_connection(identifier)
        if not conn_dict:
            return {}
        device = self.find_device(identifier)
        creds = {
            'host': conn_dict.get('host'),
            'zerotier_host': None,
            'tailscale_host': None,
            'user': conn_dict.get('user'),
            'password': conn_dict.get('password'),
            'require_sudo': conn_dict.get('require_sudo'),
            'type': device.type if device else 'generic',
            'auth_method': conn_dict.get('auth_method'),
            'exec_protocol': conn_dict.get('exec_protocol'),
            'transfer_protocol': conn_dict.get('transfer_protocol'),
            'smb_host': conn_dict.get('smb_host'),
            'smb_user': conn_dict.get('smb_user'),
            'smb_password': conn_dict.get('smb_password'),
            'smb_share': conn_dict.get('smb_share'),
            'ftp_host': conn_dict.get('ftp_host'),
            'ftp_user': conn_dict.get('ftp_user'),
            'ftp_password': conn_dict.get('ftp_password'),
            'ftp_port': conn_dict.get('ftp_port'),
            'ftp_tls': conn_dict.get('ftp_tls'),
            'ftp_passive': conn_dict.get('ftp_passive'),
        }
        return {k: v for k, v in creds.items() if v is not None}

    def get_connection(self, identifier: str, prefer_zerotier: bool = True) -> Dict:
        """
        获取设备连接信息（封装好的）
        从 devices[*] 直接读取（凭证已内联到设备定义）
        IP 选择顺序: LAN → TailScale → Zerotier
        """
        device = self.find_device(identifier)
        if not device:
            return {}
        conn = device.connection
        # 构建原始字段字典
        raw = {
            'host': conn.host,
            'user': conn.user,
            'password': conn.password,
            'require_sudo': conn.require_sudo,
            'key_file': conn.key_file,
            'auth_method': conn.auth_method,
            'exec_protocol': conn.exec_protocol,
            'transfer_protocol': conn.transfer_protocol,
            'smb_host': conn.smb_host,
            'smb_user': conn.smb_user,
            'smb_password': conn.smb_password,
            'smb_share': conn.smb_share,
            'ftp_host': conn.ftp_host,
            'ftp_user': conn.ftp_user,
            'ftp_password': conn.ftp_password,
            'ftp_port': conn.ftp_port,
            'ftp_tls': conn.ftp_tls,
            'ftp_passive': conn.ftp_passive,
        }
        raw = {k: v for k, v in raw.items() if v is not None}

        host = raw.get('host')
        if not host:
            return {}

        selected_ip = self.get_device_ip(identifier, prefer_zerotier)
        if not selected_ip:
            import sys
            print(f"[ERROR] 设备 {identifier} 所有 IP 均不可达", file=sys.stderr)
            return {}
        local_ips = get_local_ips()
        is_local = selected_ip in local_ips or selected_ip == 'localhost' or selected_ip == '127.0.0.1'

        result = {
            'host': selected_ip,
            'user': raw.get('user'),
            'password': raw.get('password'),
            'require_sudo': raw.get('require_sudo', False),
            'is_local': is_local,
            'key_file': raw.get('key_file'),
            'auth_method': raw.get('auth_method'),
            'exec_protocol': raw.get('exec_protocol'),
            'transfer_protocol': raw.get('transfer_protocol'),
            'smb_host': raw.get('smb_host'),
            'smb_user': raw.get('smb_user'),
            'smb_password': raw.get('smb_password'),
            'smb_share': raw.get('smb_share'),
            'ftp_host': raw.get('ftp_host'),
            'ftp_user': raw.get('ftp_user'),
            'ftp_password': raw.get('ftp_password'),
            'ftp_port': raw.get('ftp_port'),
            'ftp_tls': raw.get('ftp_tls', True),
            'ftp_passive': raw.get('ftp_passive', True),
        }
        return result

    def get_application(self, device_name: str, app_name: str) -> Optional[Application]:
        """获取应用配置"""
        device = self.get_device(device_name)
        if not device:
            return None
        return device.applications.get(app_name)

    def find_service(self, service_name: str) -> Optional[tuple]:
        """查找服务所在的设备"""
        for device in self.get_devices().values():
            if service_name in device.applications:
                return device, device.applications[service_name]
        return None

    def get_devices_by_capability(self, capability: str) -> List[Device]:
        """按能力查询设备"""
        devices = []
        for device in self.get_devices().values():
            if capability in device.applications:
                devices.append(device)
        return devices


# 便捷函数
def load_config(config_path: Optional[Path] = None) -> ConfigLoader:
    """加载配置"""
    return ConfigLoader(config_path)


# ========== 设备检测与IP选择 ==========

def get_local_ips() -> List[str]:
    """获取本机所有IP地址"""
    ips = []
    try:
        result = subprocess.run(
            ['ipconfig', 'getiflist'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            interfaces = result.stdout.strip().split('\n')
            for iface in interfaces:
                if iface and iface != 'lo0':
                    ip = subprocess.run(
                        ['ipconfig', 'getifaddr', iface],
                        capture_output=True,
                        text=True,
                        timeout=5
                    ).stdout.strip()
                    if ip:
                        ips.append(ip)

        if not ips:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
            s.close()
    except Exception:
        pass

    return ips


