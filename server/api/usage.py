"""
Ask Twice — 用量查询 API

GET /api/usage
"""
from fastapi import APIRouter

router = APIRouter()

# MVP: 简单的内存计数（后续用数据库）
_daily_usage: dict[str, int] = {}


@router.get("/usage")
async def get_usage():
    """
    查询今日剩余验证次数
    MVP 阶段不做用户区分，全局共享（后续接入认证后按用户计数）
    """
    from datetime import date
    today = str(date.today())
    used = _daily_usage.get(today, 0)

    return {
        "used": used,
        "limit": 5,
        "remaining": max(0, 5 - used),
        "date": today,
    }


def increment_usage():
    """增加用量计数"""
    from datetime import date
    today = str(date.today())
    _daily_usage[today] = _daily_usage.get(today, 0) + 1
