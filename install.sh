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

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未找到 Node.js，请先安装 Node.js >= 18${NC}"
    echo -e "${YELLOW}   Termux: pkg install nodejs${NC}"
    echo -e "${YELLOW}   Linux:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs${NC}"
    exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 版本过低 ($(node -v))，需要 >= 18${NC}"
    exit 1
fi

INSTALL_DIR="$HOME/st-launcher"

# 如果已安装（git 仓库），更新
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}📦 检测到已安装，正在更新...${NC}"
    cd "$INSTALL_DIR"
    git pull --ff-only 2>/dev/null || true
else
    # 清理旧的非 git 安装（如旧版二进制文件）
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}📦 清理旧版安装...${NC}"
        rm -rf "$INSTALL_DIR"
    fi
    echo -e "${YELLOW}📥 正在下载...${NC}"
    git clone https://github.com/2830897438/st-launcher.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo -e "${GREEN}✅ 安装完成！${NC}"
echo -e "${GREEN}📍 安装位置: $INSTALL_DIR${NC}"
echo ""
echo -e "${YELLOW}🚀 正在启动...${NC}"
echo ""

node launcher.js
