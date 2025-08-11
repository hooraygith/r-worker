import http from 'http'
import { URL } from 'url' // 使用 ES Module 导入

const PORT = process.env.PORT || 8080

/**
 * 带有重试和超时逻辑的 fetch 函数。
 * 现在使用 Node.js 内置的全局 fetch。
 * @param {string} url - 目标 URL
 * @param {object} options - 配置选项，如 retry, timeout
 * @returns {Promise<Response>}
 */
async function customFetch(url, options = {}) {
    // 设置默认值
    const { retry = 3, timeout = 5000, ...fetchOptions } = options

    for (let i = 0; i < retry; i++) {
        // AbortController 也是内置的
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
            // 直接使用全局的 fetch 函数
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            })
            clearTimeout(timeoutId)
            return response
        } catch (error) {
            clearTimeout(timeoutId)
            if (error.name === 'AbortError') {
                console.error(`请求 ${url} 超时。`)
            }

            console.log(`请求 ${url} 失败。正在重试... (${i + 1}/${retry})`)
            if (i < retry - 1) {
                await new Promise(res => setTimeout(res, 1000))
            } else {
                console.error(`经过 ${retry} 次尝试后，无法获取 ${url}。`, error)
                throw new Error(`Failed to fetch the target URL after retries.`)
            }
        }
    }
}

// 使用原生 http 模块创建服务器
const server = http.createServer(async (req, res) => {
    // 将请求的 URL 解析成一个 URL 对象，方便处理
    const requestUrl = new URL(req.url, `http://${req.headers.host}`)
    const pathname = requestUrl.pathname

    // 根路由，用于健康检查
    if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('App Engine Proxy Server is running. Use /proxy?url=... to make a request.')
        return
    }

    // 代理路由
    if (pathname === '/proxy') {
        const targetUrl = requestUrl.searchParams.get('url')

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('缺少 "url" 查询参数')
            return
        }

        console.log(`正在为目标代理请求: ${targetUrl}`)

        try {
            const response = await customFetch(targetUrl)

            // 使用原生方式设置响应头和状态码
            res.writeHead(response.status, Object.fromEntries(response.headers.entries()))

            // 使用流式传输，将目标响应体直接 pipe 到客户端
            response.body.pipe(res)

        } catch (error) {
            console.error('处理代理请求时出错:', error)
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('代理请求失败: ' + error.message)
        }
        return
    }

    // 处理所有其他未找到的路由
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
})

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器正在监听端口 ${PORT}`)
})