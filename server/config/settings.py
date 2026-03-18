"""
Ask Twice — 配置管理
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.modelverse.cn/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # 搜索
    BRAVE_API_KEY: str = os.getenv("BRAVE_API_KEY", "")

    # 服务
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # 限额
    FREE_DAILY_LIMIT: int = 10

    # 缓存（秒）
    CACHE_TTL: int = 1800  # 30 分钟

    # 来源权威度评分
    AUTHORITY_DOMAINS: dict = {
        5: [
            ".gov", ".edu", ".gov.cn",
            "nature.com", "science.org", "lancet.com", "nejm.org", "bmj.com",
            "who.int", "xinhuanet.com", "cas.cn", "nsfc.gov.cn",
        ],
        4: [
            "wikipedia.org", "britannica.com",  # 百科类
            "reuters.com", "bbc.com", "nytimes.com", "wsj.com",
            "caixin.com", "thepaper.cn", "ft.com",
            "mayoclinic.org", "webmd.com", "nih.gov",  # 医疗
            "arxiv.org", "scholar.google",  # 学术
            ".org.au", ".org.uk", ".ac.uk",  # 权威机构后缀
        ],
        3: [
            "baike.baidu.com", "baidu.com/medicine",  # 百度百科/健康
            "36kr.com", "techcrunch.com", "huxiu.com", "infoq.cn",
            "github.com", "stackoverflow.com",
            "dxy.cn",  # 丁香园
            "msdmanuals.com", "uptodate.com",  # 医学参考
            "worldheritage.org", "unesco.org",  # 世界遗产
            "nationalgeographic.com",
        ],
        2: [
            "zhihu.com", "weixin.qq.com", "jianshu.com", "csdn.net",
            "medium.com", "reddit.com",
            "douban.com", "sohu.com", "sina.com",
        ],
    }


settings = Settings()
