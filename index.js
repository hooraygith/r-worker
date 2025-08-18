import http from 'http'
import { URL } from 'url'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const PORT = process.env.PORT || 8080

// customFetch 函数保持不变，因为它的逻辑是正确的
async function customFetch(url, options = {}) {
    const { retry = 3, timeout = 5000, ...fetchOptions } = options
    for (let i = 0; i < retry; i++) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        try {
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

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`)
    const pathname = requestUrl.pathname

    if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('hello world!')
        return
    }

    if (pathname === '/proxy') {
        const targetUrl = requestUrl.searchParams.get('url')
        if (!targetUrl) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Not found')
            return
        }

        console.log(`正在为目标代理请求: ${targetUrl}`)

        try {
            const response = await customFetch(targetUrl)
            res.writeHead(response.status, Object.fromEntries(response.headers.entries()))

            const nodeStream = Readable.fromWeb(response.body)
            await pipeline(nodeStream, res)

        } catch (error) {
            console.error('处理代理请求时出错:', error)
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Not found')
        }
        return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
})

server.listen(PORT, () => {
    console.log(`服务器正在监听端口 ${PORT}`)
})