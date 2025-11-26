#!/bin/bash
# 呆呆鸟酒馆启动助手 - 一键安装脚本 (Termux/Linux)
# One-line install: curl -fsSL https://raw.githubusercontent.com/2830897438/st-launcher/main/install.sh | bash

set -e

echo "╔═══════════════════════════════════════════════════════╗"
echo "║                                                       ║"
echo "║     🐦 呆呆鸟酒馆启动助手 - 安装程序                 ║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# 检测运行环境
if [ -d "/data/data/com.termux" ]; then
    echo "📱 检测到 Termux 环境"
    IS_TERMUX=true
    INSTALL_DIR="$HOME/st-launcher"
else
    echo "🖥️  检测到 Linux 环境"
    IS_TERMUX=false
    INSTALL_DIR="$HOME/st-launcher"
fi

# 检查并安装依赖
echo ""
echo "🔍 检查依赖..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js..."
    if [ "$IS_TERMUX" = true ]; then
        pkg install -y nodejs
    else
        echo "请先安装 Node.js: https://nodejs.org/"
        exit 1
    fi
else
    echo "✅ Node.js 已安装: $(node -v)"
fi

# Git
if ! command -v git &> /dev/null; then
    echo "📦 安装 Git..."
    if [ "$IS_TERMUX" = true ]; then
        pkg install -y git
    else
        echo "请先安装 Git"
        exit 1
    fi
else
    echo "✅ Git 已安装"
fi

# 克隆或更新仓库
echo ""
if [ -d "$INSTALL_DIR" ]; then
    echo "🔄 更新启动器..."
    cd "$INSTALL_DIR"
    git pull --rebase 2>/dev/null || {
        echo "⚠️  更新失败，重新安装..."
        cd ..
        rm -rf "$INSTALL_DIR"
        git clone https://github.com/2830897438/st-launcher.git "$INSTALL_DIR"
    }
else
    echo "📥 下载启动器..."
    git clone https://github.com/2830897438/st-launcher.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 创建启动脚本
echo ""
echo "📝 创建启动脚本..."

# 创建 daidai 启动脚本到 $PREFIX/bin (Termux) 或 /usr/local/bin (Linux)
if [ "$IS_TERMUX" = true ]; then
    BIN_DIR="$PREFIX/bin"
else
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
fi

cat > "$BIN_DIR/daidai" << 'EOF'
#!/bin/bash
cd "$HOME/st-launcher"
node launcher.js
EOF
chmod +x "$BIN_DIR/daidai"

# 确保 PATH 包含 bin 目录
if [ "$IS_TERMUX" = false ]; then
    if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    fi
fi

echo ""
echo "╔═════════════════════════════════════════════════════════╗"
echo "║                                                         ║"
echo "║     ✅ 安装完成！                                       ║"
echo "║                                                         ║"
echo "║     启动命令:  daidai                                   ║"
echo "║                                                         ║"
echo "║     然后在浏览器中打开:                                 ║"
echo "║       http://127.0.0.1:8080                             ║"
echo "║                                                         ║"
echo "╚═════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 现在输入 daidai 即可启动!"
