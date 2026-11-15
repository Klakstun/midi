export default {
  async fetch(request, env) {
    // 如果请求的不是静态文件（比如有人直接访问根目录 /），
    // 或者找不到对应路径，默认返回 index.html
    // Cloudflare Workers 的 assets 机制会自动处理大部分请求
    return env.ASSETS.fetch(request);
  }
};