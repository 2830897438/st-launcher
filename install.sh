#!/bin/bash
# 呆呆鸟酒馆启动助手 - 安装脚本
# https://github.com/2830897438/st-launcher

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🐦 呆呆鸟酒馆启动助手 - 安装程序${NC}"
echo ""

# 检测架构
ARCH=$(uname -m)
case "$ARCH" in
    x86_64|amd64)
        BIN="st-launcher-x64"
        ;;
    aarch64|arm64)
        BIN="st-launcher-arm64"
        ;;
    *)
        echo -e "${RED}❌ 不支持的架构: $ARCH${NC}"
        exit 1
        ;;
esac

echo -e "${YELLOW}📦 检测到架构: $ARCH${NC}"
echo -e "${YELLOW}📥 正在下载 $BIN ...${NC}"

# 下载二进制文件
DOWNLOAD_URL="https://github.com/2830897438/st-launcher/releases/download/v1.1.0/$BIN"
INSTALL_DIR="$HOME/st-launcher"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if command -v curl &> /dev/null; then
    curl -fsSL "$DOWNLOAD_URL" -o st-launcher
elif command -v wget &> /dev/null; then
    wget -q "$DOWNLOAD_URL" -O st-launcher
else
    echo -e "${RED}❌ 需要 curl 或 wget${NC}"
    exit 1
fi

chmod +x st-launcher

echo -e "${GREEN}✅ 安装完成！${NC}"
echo -e "${GREEN}📍 安装位置: $INSTALL_DIR/st-launcher${NC}"
echo ""
echo -e "${YELLOW}🚀 正在启动...${NC}"
echo ""

./st-launcher
