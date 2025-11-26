#!/usr/bin/env node
/**
 * 呆呆鸟小窝 - Launcher (Termux Version)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/data/data/com.termux/files/home';
const LAUNCHER_PORT = 8080;
const SILLYTAVERN_PORT = 8000;
const VERSIONS_DIR = path.join(HOME_DIR, 'st-versions');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const DAIDAI_API = 'https://user.daidaibird.top';
const DAIDAI_UPSTREAM = 'https://api.daidaibird.top';

// 版本配置 - 官方正式发布版本
const AVAILABLE_VERSIONS = {
    '1.14.0': { name: 'v1.14.0 (最新版)', tag: '1.14.0', default: false },
    '1.13.5': { name: 'v1.13.5 (稳定版)', tag: '1.13.5', default: true },
    '1.13.4': { name: 'v1.13.4', tag: '1.13.4', default: false },
    '1.12.14': { name: 'v1.12.14 (经典版)', tag: '1.12.14', default: false },
};

// 本地发现的SillyTavern安装
let localInstallations = {};

let sillyTavernProcess = null;
let serverLogs = [];
const MAX_LOGS = 500;

// API 聚合相关
let aggregatorEnabled = false;
let userApiKeys = [];
let currentKeyIndex = 0;
let failedKeys = new Set();
let aggregatorUserToken = null;
let aggregatorUserInfo = null;

/**
 * Check if a directory is a valid SillyTavern installation
 */
function isSillyTavernDir(dir) {
    try {
        const packagePath = path.join(dir, 'package.json');
        const serverPath = path.join(dir, 'server.js');
        if (fs.existsSync(packagePath) && fs.existsSync(serverPath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
            return pkg.name === 'sillytavern' || pkg.name === 'SillyTavern';
        }
    } catch (e) {}
    return false;
}

/**
 * Get SillyTavern version from directory
 */
function getSTVersion(dir) {
    try {
        const packagePath = path.join(dir, 'package.json');
        if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
            return pkg.version || 'unknown';
        }
    } catch (e) {}
    return 'unknown';
}

/**
 * Scan for local SillyTavern installations
 */
function scanLocalInstallations() {
    const foundInstalls = {};
    const searchPaths = [
        path.join(HOME_DIR, 'SillyTavern'),
        path.join(HOME_DIR, 'sillytavern'),
        path.join(HOME_DIR, 'st'),
        path.join(HOME_DIR, 'ST'),
        '/data/data/com.termux/files/home/SillyTavern',
        '/data/data/com.termux/files/home/sillytavern',
    ];

    // Also check subdirectories of home
    try {
        const homeEntries = fs.readdirSync(HOME_DIR, { withFileTypes: true });
        for (const entry of homeEntries) {
            if (entry.isDirectory()) {
                const subPath = path.join(HOME_DIR, entry.name);
                if (!searchPaths.includes(subPath)) {
                    searchPaths.push(subPath);
                }
            }
        }
    } catch (e) {}

    for (const searchPath of searchPaths) {
        if (fs.existsSync(searchPath) && isSillyTavernDir(searchPath)) {
            // Don't include paths that are already in st-versions
            if (searchPath.startsWith(VERSIONS_DIR)) continue;

            const version = getSTVersion(searchPath);
            const key = `local_${path.basename(searchPath)}`;
            foundInstalls[key] = {
                name: `📁 本地: ${path.basename(searchPath)} (v${version})`,
                path: searchPath,
                version: version,
                isLocal: true,
            };
        }
    }

    localInstallations = foundInstalls;
    return foundInstalls;
}

/**
 * Load launcher config
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }
    return { activeVersion: null, speedOptimization: false, apiAggregation: false };
}

/**
 * Save launcher config
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Failed to save config:', e);
    }
}

/**
 * Get version directory path
 */
function getVersionPath(version) {
    // Check if it's a local installation
    if (version && version.startsWith('local_') && localInstallations[version]) {
        return localInstallations[version].path;
    }
    return path.join(VERSIONS_DIR, version);
}

/**
 * Check if version is installed
 */
function isVersionInstalled(version) {
    // Local installations are always "installed"
    if (version && version.startsWith('local_') && localInstallations[version]) {
        const localPath = localInstallations[version].path;
        return fs.existsSync(localPath) && fs.existsSync(path.join(localPath, 'node_modules'));
    }
    const versionPath = getVersionPath(version);
    return fs.existsSync(versionPath) && fs.existsSync(path.join(versionPath, 'node_modules'));
}

/**
 * Add a log entry
 */
function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    serverLogs.push({ timestamp, message, type });
    if (serverLogs.length > MAX_LOGS) {
        serverLogs.shift();
    }
}

/**
 * Check if SillyTavern is running
 */
async function checkServerStatus() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: SILLYTAVERN_PORT,
            path: '/version',
            method: 'GET',
            timeout: 2000,
        }, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

/**
 * Install a version
 */
async function installVersion(version) {
    const versionInfo = AVAILABLE_VERSIONS[version];
    if (!versionInfo) {
        return { success: false, message: '未知版本' };
    }

    const versionPath = getVersionPath(version);

    addLog(`正在安装版本 ${version}...`, 'info');

    try {
        // Clone if not exists
        if (!fs.existsSync(versionPath)) {
            addLog(`克隆 SillyTavern ${version}...`, 'info');
            execSync(`git clone --branch ${versionInfo.tag} --depth 1 https://github.com/SillyTavern/SillyTavern.git ${versionPath}`, {
                stdio: 'pipe',
                timeout: 600000,
            });
        }

        // Install dependencies
        addLog(`安装依赖...`, 'info');
        execSync('npm install', {
            cwd: versionPath,
            stdio: 'pipe',
            timeout: 900000,
        });

        // Configure security override
        const configPath = path.join(versionPath, 'config.yaml');
        if (fs.existsSync(configPath)) {
            let config = fs.readFileSync(configPath, 'utf-8');
            config = config.replace('securityOverride: false', 'securityOverride: true');
            fs.writeFileSync(configPath, config);
        }

        addLog(`版本 ${version} 安装完成！`, 'info');
        return { success: true, message: '安装成功' };
    } catch (error) {
        addLog(`安装失败: ${error.message}`, 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Uninstall a version
 */
function uninstallVersion(version) {
    const versionInfo = AVAILABLE_VERSIONS[version];
    if (!versionInfo) {
        return { success: false, message: '未知版本' };
    }

    const versionPath = getVersionPath(version);

    if (!fs.existsSync(versionPath)) {
        return { success: false, message: '版本未安装' };
    }

    // Check if this version is currently active
    const config = loadConfig();
    if (config.activeVersion === version) {
        return { success: false, message: '无法卸载当前使用的版本，请先切换到其他版本' };
    }

    // Check if server is running this version
    if (sillyTavernProcess) {
        return { success: false, message: '请先停止服务再卸载' };
    }

    try {
        addLog(`正在卸载版本 ${version}...`, 'info');
        fs.rmSync(versionPath, { recursive: true, force: true });
        addLog(`版本 ${version} 已卸载`, 'info');
        return { success: true, message: '卸载成功' };
    } catch (error) {
        addLog(`卸载失败: ${error.message}`, 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Apply speed optimization to SillyTavern
 */
function applySpeedOptimization(version, enable) {
    const versionPath = getVersionPath(version);
    if (!fs.existsSync(versionPath)) {
        return { success: false, message: '版本未安装' };
    }

    try {
        // 1. 修改 config.yaml
        const configPath = path.join(versionPath, 'config.yaml');
        if (fs.existsSync(configPath)) {
            let config = fs.readFileSync(configPath, 'utf-8');
            if (enable) {
                config = config.replace(/cacheBuster:\s*\n\s*enabled:\s*true/g, 'cacheBuster:\n  enabled: false');
            } else {
                config = config.replace(/cacheBuster:\s*\n\s*enabled:\s*false/g, 'cacheBuster:\n  enabled: true');
            }
            fs.writeFileSync(configPath, config);
        }

        // 2. 修改 server-main.js 添加缓存头
        const serverMainPath = path.join(versionPath, 'src', 'server-main.js');
        if (fs.existsSync(serverMainPath)) {
            let serverMain = fs.readFileSync(serverMainPath, 'utf-8');

            // 检查是否已经有缓存优化代码
            const cacheOptMarker = '// DAIDAI_CACHE_OPT';

            if (enable && !serverMain.includes(cacheOptMarker)) {
                // 查找 express.static 配置并添加缓存
                const staticPattern = /app\.use\(express\.static\(path\.join\(serverDirectory,\s*'public'\)\)\)/;
                const cacheStaticCode = `// DAIDAI_CACHE_OPT
app.use(express.static(path.join(serverDirectory, 'public'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.match(/\\.(js|css|woff|woff2|ttf|svg|png|jpg|jpeg|gif|ico)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
        }
        if (filePath.match(/\\.html$/)) {
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
    },
}))`;
                serverMain = serverMain.replace(staticPattern, cacheStaticCode);
                fs.writeFileSync(serverMainPath, serverMain);
            } else if (!enable && serverMain.includes(cacheOptMarker)) {
                // 恢复原始配置
                const cacheOptPattern = /\/\/ DAIDAI_CACHE_OPT\napp\.use\(express\.static\(path\.join\(serverDirectory,\s*'public'\),\s*\{[\s\S]*?\}\)\)/;
                serverMain = serverMain.replace(cacheOptPattern, "app.use(express.static(path.join(serverDirectory, 'public')))");
                fs.writeFileSync(serverMainPath, serverMain);
            }
        }

        addLog(`速度优化已${enable ? '开启' : '关闭'}`, 'info');
        return { success: true, message: `速度优化已${enable ? '开启' : '关闭'}，重启服务后生效` };
    } catch (error) {
        addLog(`速度优化设置失败: ${error.message}`, 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Start API Aggregator (initialize keys, runs on same port as launcher)
 */
async function startAggregator(userToken, userInfo) {
    if (aggregatorEnabled && userApiKeys.length > 0) {
        return { success: true, message: '聚合服务已在运行', port: LAUNCHER_PORT };
    }

    // 获取用户的 API 密钥
    try {
        const userData = {
            userId: userInfo.userId || userInfo.uid,
            userEmail: userInfo.userEmail,
            password: userInfo.password,
            invitationCode: userInfo.invitationCode
        };

        const response = await fetch(`${DAIDAI_API}/api/general/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ userData: JSON.stringify(userData), page: 1 })
        });

        const data = await response.json();
        if (data.code === 200 && data.msg && data.msg.length > 0) {
            userApiKeys = data.msg.map(item => ({
                key: item.api_key,
                balance: parseFloat(item.balance) || 0
            })).filter(k => k.balance > 0);

            if (userApiKeys.length === 0) {
                return { success: false, message: '没有可用的 API 密钥（余额不足）' };
            }
        } else {
            return { success: false, message: '获取 API 密钥失败' };
        }
    } catch (error) {
        return { success: false, message: `获取密钥失败: ${error.message}` };
    }

    aggregatorEnabled = true;
    aggregatorUserToken = userToken;
    aggregatorUserInfo = userInfo;
    failedKeys.clear();
    currentKeyIndex = 0;

    addLog(`API 聚合服务已启动，可用密钥: ${userApiKeys.length}`, 'info');
    return {
        success: true,
        message: `聚合服务已启动`,
        port: LAUNCHER_PORT,
        keysCount: userApiKeys.length,
        endpoint: `/v1`
    };
}

/**
 * Get next available API key (round-robin with skip failed)
 */
function getNextKey() {
    const availableKeys = userApiKeys.filter(k => !failedKeys.has(k.key));
    if (availableKeys.length === 0) {
        failedKeys.clear(); // 重置失败列表
        if (userApiKeys.length === 0) return null;
        return userApiKeys[0];
    }
    currentKeyIndex = (currentKeyIndex + 1) % availableKeys.length;
    return availableKeys[currentKeyIndex];
}

/**
 * Handle API aggregator proxy request
 */
async function handleAggregatorProxy(req, res, apiPath) {
    if (!aggregatorEnabled || userApiKeys.length === 0) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API 聚合服务未启动' }));
        return;
    }

    const keyObj = getNextKey();
    if (!keyObj) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '没有可用的 API 密钥' }));
        return;
    }

    // 收集请求体
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const upstreamUrl = `${DAIDAI_UPSTREAM}${apiPath}`;
            const headers = {};
            // 只保留必要的头
            if (req.headers['content-type']) {
                headers['Content-Type'] = req.headers['content-type'];
            }
            headers['Authorization'] = `Bearer ${keyObj.key}`;

            const upstreamRes = await fetch(upstreamUrl, {
                method: req.method,
                headers: headers,
                body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
            });

            // 如果请求失败，标记该 key
            if (upstreamRes.status === 401 || upstreamRes.status === 403 || upstreamRes.status === 429) {
                failedKeys.add(keyObj.key);
                addLog(`API Key ${keyObj.key.slice(0, 8)}... 不可用，已跳过`, 'error');
            }

            // 转发响应
            const responseHeaders = {
                'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
                'Access-Control-Allow-Origin': '*',
            };
            res.writeHead(upstreamRes.status, responseHeaders);

            const responseBody = await upstreamRes.text();
            res.end(responseBody);
        } catch (error) {
            failedKeys.add(keyObj.key);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `代理请求失败: ${error.message}` }));
        }
    });
}

/**
 * Stop API Aggregator
 */
function stopAggregator() {
    if (!aggregatorEnabled) {
        return { success: true, message: '聚合服务未运行' };
    }

    aggregatorEnabled = false;
    userApiKeys = [];
    failedKeys.clear();
    aggregatorUserToken = null;
    aggregatorUserInfo = null;
    addLog('API 聚合服务已停止', 'info');
    return { success: true, message: '聚合服务已停止' };
}

/**
 * Get aggregator status
 */
function getAggregatorStatus() {
    return {
        running: aggregatorEnabled,
        port: LAUNCHER_PORT,
        keysCount: userApiKeys.length,
        failedKeysCount: failedKeys.size,
        endpoint: aggregatorEnabled ? `/v1` : null
    };
}

/**
 * Kill process using a specific port (cross-platform, Termux compatible)
 */
function killPort(port) {
    try {
        // Method 1: Try fuser (Linux)
        try {
            execSync(`fuser -k ${port}/tcp 2>/dev/null`, { stdio: 'ignore' });
            return true;
        } catch (e) {}

        // Method 2: Try lsof (macOS/some Linux)
        try {
            const pid = execSync(`lsof -t -i:${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
            if (pid) {
                execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore' });
                return true;
            }
        } catch (e) {}

        // Method 3: Try ss + awk (Termux/Linux)
        try {
            const result = execSync(`ss -tlnp 2>/dev/null | grep :${port} | awk '{print $6}' | grep -o 'pid=[0-9]*' | cut -d= -f2`, { encoding: 'utf-8' }).trim();
            if (result) {
                execSync(`kill -9 ${result} 2>/dev/null`, { stdio: 'ignore' });
                return true;
            }
        } catch (e) {}

        // Method 4: Try pkill by script name
        try {
            execSync(`pkill -f "node.*launcher.js" 2>/dev/null`, { stdio: 'ignore' });
            return true;
        } catch (e) {}

        return false;
    } catch (e) {
        return false;
    }
}

/**
 * Start SillyTavern server
 */
async function startServer() {
    if (sillyTavernProcess) {
        return { success: false, message: '服务器已在运行中' };
    }

    const isRunning = await checkServerStatus();
    if (isRunning) {
        // 尝试自动清理端口
        addLog('检测到端口被占用，正在自动清理...', 'info');
        killPort(SILLYTAVERN_PORT);
        await new Promise(r => setTimeout(r, 1000)); // 等待1秒

        const stillRunning = await checkServerStatus();
        if (stillRunning) {
            return { success: false, message: '服务器已在运行中，无法自动清理端口' };
        }
        addLog('端口已清理', 'info');
    }

    const config = loadConfig();
    const version = config.activeVersion || '1.13.5';
    const versionPath = getVersionPath(version);

    if (!isVersionInstalled(version)) {
        return { success: false, message: `版本 ${version} 未安装，请先在设置中安装` };
    }

    // 启动前再次确保端口清理
    killPort(SILLYTAVERN_PORT);
    await new Promise(r => setTimeout(r, 500));

    return new Promise((resolve) => {
        addLog(`正在启动 SillyTavern ${version}...`, 'info');

        sillyTavernProcess = spawn('node', ['server.js', '--listen', '--whitelist', 'false'], {
            cwd: versionPath,
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        sillyTavernProcess.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                addLog(message, 'stdout');
                console.log('[ST]', message);
            }
        });

        sillyTavernProcess.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                addLog(message, 'stderr');
                console.error('[ST ERROR]', message);
            }
        });

        sillyTavernProcess.on('error', (err) => {
            addLog(`启动失败: ${err.message}`, 'error');
            sillyTavernProcess = null;
            resolve({ success: false, message: `启动失败: ${err.message}` });
        });

        sillyTavernProcess.on('exit', (code) => {
            addLog(`服务器已停止 (退出码: ${code})`, 'info');
            sillyTavernProcess = null;
        });

        // Wait for server to start
        let attempts = 0;
        const maxAttempts = 120;
        const checkInterval = setInterval(async () => {
            attempts++;
            const isRunning = await checkServerStatus();
            if (isRunning) {
                clearInterval(checkInterval);
                addLog('SillyTavern 启动成功!', 'info');
                resolve({ success: true, message: '启动成功' });
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                if (sillyTavernProcess) {
                    addLog('启动时间较长，但服务可能仍在初始化...', 'info');
                    resolve({ success: true, message: '启动成功（初始化中）' });
                } else {
                    resolve({ success: false, message: '启动失败，请检查日志' });
                }
            }
        }, 500);
    });
}

/**
 * Stop SillyTavern server
 */
async function stopServer() {
    if (!sillyTavernProcess) {
        return { success: false, message: '服务器未在运行' };
    }

    return new Promise((resolve) => {
        addLog('正在停止 SillyTavern...', 'info');

        sillyTavernProcess.on('exit', () => {
            sillyTavernProcess = null;
            resolve({ success: true, message: '服务器已停止' });
        });

        sillyTavernProcess.kill('SIGTERM');

        setTimeout(() => {
            if (sillyTavernProcess) {
                sillyTavernProcess.kill('SIGKILL');
                sillyTavernProcess = null;
                resolve({ success: true, message: '服务器已强制停止' });
            }
        }, 5000);
    });
}

/**
 * Get server version info
 */
async function getVersionInfo() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: SILLYTAVERN_PORT,
            path: '/version',
            method: 'GET',
            timeout: 2000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
        req.end();
    });
}

/**
 * Get versions list with status
 */
function getVersionsList() {
    const config = loadConfig();
    const versions = [];

    // First add local installations (they appear at the top)
    for (const [key, info] of Object.entries(localInstallations)) {
        versions.push({
            version: key,
            name: info.name,
            installed: true,
            active: config.activeVersion === key,
            default: false,
            isLocal: true,
            path: info.path,
        });
    }

    // Then add downloadable versions
    for (const [version, info] of Object.entries(AVAILABLE_VERSIONS)) {
        versions.push({
            version,
            name: info.name,
            installed: isVersionInstalled(version),
            active: config.activeVersion === version,
            default: info.default,
            isLocal: false,
        });
    }

    return versions;
}

/**
 * Copy directory recursively
 */
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Switch active version
 */
function switchVersion(version) {
    // Check if it's a local installation or a downloadable version
    const isLocal = version && version.startsWith('local_');

    if (!isLocal && !AVAILABLE_VERSIONS[version]) {
        return { success: false, message: '未知版本' };
    }

    if (isLocal && !localInstallations[version]) {
        return { success: false, message: '本地安装不存在' };
    }

    if (!isVersionInstalled(version)) {
        return { success: false, message: '版本未安装，请先安装' };
    }

    const config = loadConfig();
    const oldVersion = config.activeVersion;

    // 如果切换到不同版本，迁移 data 文件夹（本地版本不迁移）
    if (oldVersion && oldVersion !== version && !isLocal) {
        const oldDataPath = path.join(getVersionPath(oldVersion), 'data');
        const newDataPath = path.join(getVersionPath(version), 'data');

        if (fs.existsSync(oldDataPath)) {
            try {
                addLog(`正在迁移数据从 ${oldVersion} 到 ${version}...`, 'info');
                copyDirSync(oldDataPath, newDataPath);
                addLog('数据迁移完成', 'info');
            } catch (error) {
                addLog(`数据迁移失败: ${error.message}`, 'error');
                return { success: false, message: `数据迁移失败: ${error.message}` };
            }
        }
    }

    config.activeVersion = version;
    saveConfig(config);

    addLog(`已切换到版本 ${version}`, 'info');
    return { success: true, message: `已切换到 ${version}，数据已同步` };
}

/**
 * Handle API requests
 */
async function handleApi(req, res) {
    const url = new URL(req.url, `http://localhost:${LAUNCHER_PORT}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    switch (pathname) {
        case '/api/status': {
            const isRunning = await checkServerStatus();
            const version = isRunning ? await getVersionInfo() : null;
            const config = loadConfig();
            res.end(JSON.stringify({
                running: isRunning,
                port: SILLYTAVERN_PORT,
                version: version,
                activeVersion: config.activeVersion,
                managedByLauncher: sillyTavernProcess !== null,
            }));
            break;
        }

        case '/api/start': {
            const result = await startServer();
            res.end(JSON.stringify(result));
            break;
        }

        case '/api/stop': {
            const result = await stopServer();
            res.end(JSON.stringify(result));
            break;
        }

        case '/api/logs': {
            res.end(JSON.stringify({ logs: serverLogs }));
            break;
        }

        case '/api/clear-logs': {
            serverLogs = [];
            res.end(JSON.stringify({ success: true }));
            break;
        }

        case '/api/versions': {
            res.end(JSON.stringify({ versions: getVersionsList() }));
            break;
        }

        case '/api/versions/rescan': {
            scanLocalInstallations();
            res.end(JSON.stringify({
                success: true,
                message: `发现 ${Object.keys(localInstallations).length} 个本地安装`,
                versions: getVersionsList()
            }));
            break;
        }

        case '/api/versions/switch': {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { version } = JSON.parse(body);
                    const result = switchVersion(version);
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.end(JSON.stringify({ success: false, message: '参数错误' }));
                }
            });
            return;
        }

        case '/api/versions/install': {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { version } = JSON.parse(body);
                    const result = await installVersion(version);
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.end(JSON.stringify({ success: false, message: e.message }));
                }
            });
            return;
        }

        case '/api/versions/uninstall': {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { version } = JSON.parse(body);
                    const result = uninstallVersion(version);
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.end(JSON.stringify({ success: false, message: e.message }));
                }
            });
            return;
        }

        case '/api/settings': {
            const config = loadConfig();
            res.end(JSON.stringify({
                speedOptimization: config.speedOptimization || false,
                apiAggregation: config.apiAggregation || false,
                aggregator: getAggregatorStatus()
            }));
            break;
        }

        case '/api/settings/speed-optimization': {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { enable } = JSON.parse(body);
                    const config = loadConfig();
                    const result = applySpeedOptimization(config.activeVersion, enable);
                    if (result.success) {
                        config.speedOptimization = enable;
                        saveConfig(config);
                    }
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.end(JSON.stringify({ success: false, message: e.message }));
                }
            });
            return;
        }

        case '/api/aggregator/start': {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { token, userInfo } = JSON.parse(body);
                    if (!token || !userInfo) {
                        res.end(JSON.stringify({ success: false, message: '请先绑定呆呆鸟账号' }));
                        return;
                    }
                    const result = await startAggregator(token, userInfo);
                    if (result.success) {
                        const config = loadConfig();
                        config.apiAggregation = true;
                        saveConfig(config);
                    }
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.end(JSON.stringify({ success: false, message: e.message }));
                }
            });
            return;
        }

        case '/api/aggregator/stop': {
            const result = stopAggregator();
            if (result.success) {
                const config = loadConfig();
                config.apiAggregation = false;
                saveConfig(config);
            }
            res.end(JSON.stringify(result));
            break;
        }

        case '/api/aggregator/status': {
            res.end(JSON.stringify(getAggregatorStatus()));
            break;
        }

        default:
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Not found' }));
    }
}

/**
 * Serve static files
 */
function serveStatic(req, res) {
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);

    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
    };

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Not Found');
            return;
        }

        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.end(data);
    });
}

/**
 * Main request handler
 */
async function requestHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    // API 聚合路由 - /v1/* 请求转发到上游
    if (req.url.startsWith('/v1/') || req.url === '/v1') {
        await handleAggregatorProxy(req, res, req.url);
        return;
    }

    if (req.url.startsWith('/api/')) {
        await handleApi(req, res);
    } else {
        serveStatic(req, res);
    }
}

// Ensure versions directory exists
if (!fs.existsSync(VERSIONS_DIR)) {
    fs.mkdirSync(VERSIONS_DIR, { recursive: true });
}

// Scan for local SillyTavern installations
console.log('🔍 扫描本地安装...');
scanLocalInstallations();
const localCount = Object.keys(localInstallations).length;
if (localCount > 0) {
    console.log(`✅ 发现 ${localCount} 个本地安装`);
    for (const [key, info] of Object.entries(localInstallations)) {
        console.log(`   📁 ${info.path} (v${info.version})`);
    }

    // Auto-select local installation if no version configured
    const config = loadConfig();
    if (!config.activeVersion) {
        const firstLocal = Object.keys(localInstallations)[0];
        config.activeVersion = firstLocal;
        saveConfig(config);
        console.log(`✅ 已自动绑定: ${localInstallations[firstLocal].path}`);
    }
} else {
    console.log('📭 未发现本地安装，可在面板中下载');
}

// Auto cleanup port before starting
console.log('🔍 检查端口占用...');
killPort(LAUNCHER_PORT);

// Create and start the launcher server
const server = http.createServer(requestHandler);
let retryCount = 0;
const MAX_RETRIES = 3;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
            console.error(`\n❌ 端口 ${LAUNCHER_PORT} 无法释放，请手动执行: pkill -f launcher.js`);
            process.exit(1);
        }
        console.log(`\n⚠️  端口 ${LAUNCHER_PORT} 被占用，尝试清理 (${retryCount}/${MAX_RETRIES})...`);
        killPort(LAUNCHER_PORT);
        setTimeout(() => {
            server.listen(LAUNCHER_PORT, '0.0.0.0');
        }, 1500);
    } else {
        console.error('启动失败:', err);
        process.exit(1);
    }
});

// Wait a bit for port cleanup then start
setTimeout(() => {
    server.listen(LAUNCHER_PORT, '0.0.0.0');
}, 500);

server.on('listening', () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║            🐦 呆呆鸟小窝 已就绪！                    ║
║                                                       ║
║    面板地址:   http://127.0.0.1:${LAUNCHER_PORT}                  ║
║    服务端口:   ${SILLYTAVERN_PORT}                                  ║
║    API聚合:    http://127.0.0.1:${LAUNCHER_PORT}/v1            ║
║                                                       ║
║    在浏览器中打开上面的地址即可使用                  ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
    addLog('启动器已就绪', 'info');

    // Check installed versions
    const versions = getVersionsList();
    versions.forEach(v => {
        console.log(`  ${v.version}: ${v.installed ? '已安装' : '未安装'}${v.active ? ' (当前)' : ''}`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n正在关闭...');
    if (sillyTavernProcess) {
        await stopServer();
    }
    server.close(() => {
        console.log('启动器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    if (sillyTavernProcess) {
        await stopServer();
    }
    server.close(() => process.exit(0));
});
