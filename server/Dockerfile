FROM docker.m.daocloud.io/library/python:3.11-slim

WORKDIR /app

# 安装依赖（使用阿里云 pip 源加速）
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com -r requirements.txt

# 复制代码
COPY . .

# 暴露端口
EXPOSE 8001

# 生产模式启动
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
