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

# 检测环境：Termux / Linux(apt) / Linux(yum) / macOS
detect_env() {
    if [ -n "$PREFIX" ] && [ -x "$PREFIX/bin/pkg" ]; then
        echo "termux"
    elif [ -f /etc/debian_version ] || command -v apt-get &> /dev/null; then
        echo "debian"
    elif command -v yum &> /dev/null; then
        echo "rhel"
    elif [ "$(uname)" = "Darwin" ]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

ENV_TYPE=$(detect_env)
echo -e "${YELLOW}📦 检测到环境: $ENV_TYPE${NC}"

# 安装 git
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}📥 正在安装 git...${NC}"
    case "$ENV_TYPE" in
        termux)
            pkg install -y git
            ;;
        debian)
            sudo apt-get update -qq && sudo apt-get install -y -qq git
            ;;
        rhel)
            sudo yum install -y git
            ;;
        macos)
            xcode-select --install 2>/dev/null || true
            ;;
        *)
            echo -e "${RED}❌ 无法自动安装 git，请手动安装后重试${NC}"
            exit 1
            ;;
    esac
fi

# 安装 Node.js
install_node() {
    echo -e "${YELLOW}📥 正在安装 Node.js...${NC}"
    case "$ENV_TYPE" in
        termux)
            pkg install -y nodejs
            ;;
        debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
            sudo apt-get install -y -qq nodejs
            ;;
        rhel)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew install node@20
            else
                echo -e "${RED}❌ 请先安装 Homebrew: https://brew.sh${NC}"
                exit 1
            fi
            ;;
        *)
            echo -e "${RED}❌ 无法自动安装 Node.js，请手动安装 >= 18 后重试${NC}"
            exit 1
            ;;
    esac
}

if ! command -v node &> /dev/null; then
    install_node
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Node.js 版本过低 ($(node -v))，正在升级...${NC}"
    install_node
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -lt 18 ]; then
        echo -e "${RED}❌ Node.js 升级失败，当前版本 $(node -v)，需要 >= 18${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Node.js $(node -v) | git $(git --version | cut -d' ' -f3)${NC}"
echo ""

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
