"""
Ask Twice — FastAPI 应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.settings import settings
from api import verify, usage


# 创建 FastAPI 应用
app = FastAPI(
    title="Ask Twice API",
    description="AI 回答可信度验证服务",
    version="0.1.0",
)

# CORS 配置（允许浏览器插件跨域请求）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 浏览器插件需要
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(verify.router, prefix="/api", tags=["verify"])
app.include_router(usage.router, prefix="/api", tags=["usage"])


@app.get("/")
async def root():
    return {
        "name": "Ask Twice API",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


# ═══════ 启动 ═══════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
