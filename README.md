# 证件OCR识别系统

这是一个基于Flask和Vue.js的证件OCR识别系统，可以识别驾驶证和行驶证，并提取相关信息。

## 功能特点

- 支持驾驶证和行驶证的OCR识别
- 自动提取证件关键信息
- 支持文本信息解析
- 美观的用户界面
- 实时识别状态显示

## 系统要求

- Python 3.8+
- Node.js 14+
- npm 6+

## 安装步骤

1. 克隆项目到本地：
```bash
git clone [项目地址]
cd licenseOCR
```

2. 创建并激活虚拟环境：
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

3. 安装Python依赖：
```bash
pip install -r requirements.txt
```

## 使用方法

1. 启动后端服务：
```bash
python info_extract.py
```

2. 在浏览器中访问：
```
http://localhost:5000
```

3. 使用系统：
   - 在文本框中输入订单信息
   - 点击"解析文本"按钮
   - 上传驾驶证和行驶证图片
   - 点击"解析证件"按钮
   - 查看提取的信息
   - 点击"合并信息"按钮生成完整报告

## 目录结构

```
licenseOCR/
├── templates/
│   └── index.html
├── static/
│   ├── js/
│   │   └── main.js
│   └── css/
│       └── styles.css
├── uploads/
├── info_extract.py
└── requirements.txt
```

## 注意事项

1. 确保上传的图片清晰可读
2. 支持的图片格式：PNG、JPG、JPEG
3. 图片大小限制：16MB
4. 请确保网络连接正常，以便调用OCR服务

## 错误处理

如果遇到问题，请检查：
1. 后端服务是否正常运行
2. 网络连接是否正常
3. 上传的图片是否符合要求
4. 查看 `app.log` 文件中的错误日志

## 技术支持

如有问题，请联系技术支持人员。

## 许可证

本项目采用 MIT 许可证。 