# Sub-Store Docker - Optimized

🐳 Optimized Docker image for [Sub-Store](https://github.com/sub-store-org/Sub-Store) with [http-meta](https://github.com/xream/http-meta) support.

[![Docker Image Size](https://img.shields.io/badge/size-165MB-blue)](https://github.com/rz467fzs7d/sub-store-docker)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## ✨ Features

- 🚀 **37.5% smaller** than original image (165MB vs 264MB)
- 🏗️ Multi-stage build for optimized image size
- 🌏 China mirror support for faster builds
- 🔧 Flexible GitHub proxy configuration
- 📦 Includes http-meta (MetaCubeX mihomo) support
- 🔔 Built-in notification support (shoutrrr)
- 🏥 Health check configured

## 📊 Image Comparison

| Feature | Original | Optimized | Improvement |
|---------|----------|-----------|-------------|
| **Image Size** | 264MB | 165MB | ✅ -99MB (-37.5%) |
| **Base Image** | node:22-alpine | alpine:3.20 + nodejs-current | ✅ Lighter runtime |
| **Build Tools** | Included | Removed | ✅ Cleaner image |
| **Build Time** | Standard | With mirrors | ✅ Faster in China |

## 🚀 Quick Start

### Using Docker CLI

```bash
docker run -d \
  --name sub-store \
  --restart unless-stopped \
  -p 3001:3001 \
  -v /path/to/data:/opt/app/data \
  -e SUB_STORE_FRONTEND_BACKEND_PATH=/backend \
  rz467fzs7d/sub-store:latest
```

### Using Docker Compose

```bash
# Clone this repository
git clone https://github.com/rz467fzs7d/sub-store-docker.git
cd sub-store-docker

# Start the service
docker-compose up -d
```

Access the web interface at: `http://localhost:3001`

### OpenWrt Bypass Gateway Mode

**⚠️ Important**: If you're deploying on OpenWrt as a bypass gateway, you need special DNS and firewall configurations.

👉 **See detailed guide**: [OPENWRT-GUIDE.md](OPENWRT-GUIDE.md)

**Quick checklist**:
- ✅ Configure DNS servers in docker-compose.yml
- ✅ Add iptables MASQUERADE rule for container NAT
- ✅ Allow container ports in firewall

## 🔨 Build Options

### Standard Build (Direct GitHub Access)

```bash
docker build -t sub-store:latest .
```

### Build with GitHub Proxy (Faster in China)

```bash
docker build \
  --build-arg GITHUB_PROXY=https://ghfast.top/ \
  -t sub-store:latest .
```

### Other Available Proxies

- `https://ghproxy.net/`
- `https://gh.api.99988866.xyz/`
- `https://mirror.ghproxy.com/`

## 📋 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SUB_STORE_FRONTEND_BACKEND_PATH` | Backend API path | `/backend` | No |
| `SUB_STORE_FRONTEND_PATH` | Frontend files path | `/opt/app/frontend` | No |
| `SUB_STORE_DATA_BASE_PATH` | Data storage path | `/opt/app/data` | No |
| `TIME_ZONE` | Container timezone | `Asia/Shanghai` | No |

### Volumes

| Container Path | Description | Recommended Host Path |
|----------------|-------------|-----------------------|
| `/opt/app/data` | Sub-Store data | `/etc/sub-store/data` or `./data` |

### Ports

| Port | Service | Description |
|------|---------|-------------|
| 3000 | Backend | Sub-Store API server |
| 3001 | Frontend | Sub-Store web interface |

## 📖 Advanced Usage

### Custom DNS Configuration

```bash
docker run -d \
  --name sub-store \
  --dns 192.168.1.1 \
  -p 3001:3001 \
  -v ./data:/opt/app/data \
  rz467fzs7d/sub-store:latest
```

### Network Mode

```bash
docker run -d \
  --name sub-store \
  --network host \
  -v ./data:/opt/app/data \
  rz467fzs7d/sub-store:latest
```

### Check Logs

```bash
# View all logs
docker logs sub-store

# Follow logs in real-time
docker logs -f sub-store

# View last 100 lines
docker logs --tail 100 sub-store
```

### Health Check

The image includes a health check that runs every 30 seconds:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' sub-store
```

## 🏗️ Build Details

### Optimization Techniques

1. **Multi-stage Build**: Separates build and runtime environments
2. **Minimal Base Image**: Uses Alpine Linux with only nodejs-current
3. **Layer Optimization**: Combines commands to reduce layer count
4. **Build Tool Removal**: curl, unzip removed from final image
5. **China Mirror Sources**: Faster APK package downloads

### Build Arguments

| Argument | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_PROXY` | GitHub download proxy | `""` (empty) | `https://ghfast.top/` |

### Image Layers

```
Layer 1: Alpine 3.20 base           ~8MB
Layer 2: nodejs-current + tzdata    ~40MB
Layer 3: Application files          ~50MB
Layer 4: Binaries (mihomo/shoutrrr) ~42MB
Layer 5: Permissions                ~25MB
─────────────────────────────────────────
Total:                               165MB
```

## 🔧 Troubleshooting

### Container Won't Start

```bash
# Check container logs
docker logs sub-store

# Check if ports are already in use
lsof -i :3001
# or
netstat -tuln | grep 3001
```

### Permission Issues

If you encounter permission errors:

```bash
# Ensure the data directory is writable
chmod -R 777 /path/to/data

# Or run container with specific user
docker run -d \
  --user $(id -u):$(id -g) \
  ...
```

### Network Issues

```bash
# Test if Sub-Store can access external URLs
docker exec sub-store wget -O- https://www.google.com

# Check DNS resolution
docker exec sub-store nslookup github.com
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development

```bash
# Clone the repository
git clone https://github.com/rz467fzs7d/sub-store-docker.git
cd sub-store-docker

# Build the image
docker build -t sub-store:dev .

# Test the image
docker run --rm sub-store:dev node --version
```

## 📝 Changelog

### v1.0.0 (2025-12-18)

- ✨ Initial release
- 🚀 Optimized image size from 264MB to 165MB
- 🌏 Added China mirror support
- 🔧 Added GitHub proxy build argument
- 🏥 Added health check
- 📦 Included http-meta support

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [Sub-Store](https://github.com/sub-store-org/Sub-Store) - Advanced subscription manager
- [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) - Web interface
- [http-meta](https://github.com/xream/http-meta) - HTTP metadata service
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) - Clash core

## 🙏 Acknowledgments

- [Sub-Store Team](https://github.com/sub-store-org) for the amazing subscription manager
- [xream](https://github.com/xream) for http-meta
- [MetaCubeX](https://github.com/MetaCubeX) for mihomo (Clash Meta core)

## ⭐ Star History

If you find this project helpful, please consider giving it a star!

---

**Made with ❤️ by the community**
