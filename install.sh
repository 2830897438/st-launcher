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

cat > "$HOME/st" << 'EOF'
#!/bin/bash
cd "$HOME/st-launcher"
node launcher.js
EOF
chmod +x "$HOME/st"

# 添加到 PATH (仅 Termux)
if [ "$IS_TERMUX" = true ]; then
    if ! grep -q 'alias st=' ~/.bashrc 2>/dev/null; then
        echo 'alias st="$HOME/st"' >> ~/.bashrc
    fi
fi

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║                                                       ║"
echo "║     ✅ 安装完成！                                    ║"
echo "║                                                       ║"
echo "║     启动方式：                                        ║"
echo "║       ~/st        或   cd ~/st-launcher && node launcher.js     ║"
echo "║                                                       ║"
echo "║     然后在浏览器中打开:                               ║"
echo "║       http://127.0.0.1:8080                          ║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# 询问是否立即启动
read -p "🚀 是否立即启动? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    exec node launcher.js
fi
