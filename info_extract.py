from flask import Flask, request, jsonify, render_template_string, send_from_directory, redirect, url_for
from flask_cors import CORS
import os
import re
import json
import requests
import logging
from datetime import datetime
from typing import Dict, Optional
from werkzeug.utils import secure_filename

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 获取当前文件所在目录的绝对路径
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__, 
    static_folder=os.path.join(BASE_DIR, 'static'),
    template_folder=os.path.join(BASE_DIR, 'templates'))
CORS(app)  # 启用CORS支持

# 配置信息
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
OCR_API_URL = "http://ai.i.sinotrans.com/OcrPlugins/core/ocr"
GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
API_KEY = "8d86ddf5f3884bcab7260b0e40b35efb.it4mjTgsg6oAfGiU"

# OCR服务凭证
OCR_CREDENTIALS = {
    "docType": "TX_COMMON_OCR",
    "ifNeedOcr": "1",
    "ocrType": "HIGH",
    "outputType": "tencentResult",
    "appId": "onSovuHS",
    "appKey": "uMNaaJVX",
    "appSecret": "d8556c0a4e2c90c16f6fbefb8c1bdf9c"
}

# 确保上传目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 添加设备检测函数
def is_mobile_device():
    """检测是否为移动设备"""
    user_agent = request.headers.get('User-Agent', '').lower()
    mobile_agents = ['iphone', 'android', 'mobile', 'tablet', 'ipad', 'mobi']
    return any(agent in user_agent for agent in mobile_agents)

# 修改根路由，简化逻辑，确保PC版页面总是正确加载
@app.route('/')
def index():
    try:
        logger.info("访问首页")
        
        # 始终使用PC版页面，避免引用错误
        pc_index_path = os.path.join(app.template_folder, 'index.html')
        
        if not os.path.exists(pc_index_path):
            logger.error(f"PC端首页文件不存在: {pc_index_path}")
            return jsonify({'error': '首页文件不存在'}), 404
            
        return send_from_directory(app.template_folder, 'index.html')
    except Exception as e:
        logger.error(f"访问首页失败: {str(e)}")
        return jsonify({'error': '访问首页失败'}), 500

# 修改静态文件路由，始终提供PC版静态文件
@app.route('/static/<path:filename>')
def serve_static(filename):
    try:
        logger.info(f"请求静态文件: {filename}")
        
        # 直接提供PC版静态文件
        file_path = os.path.join(app.static_folder, filename)
        if not os.path.exists(file_path):
            logger.error(f"文件不存在: {file_path}")
            return jsonify({'error': '文件不存在'}), 404
            
        logger.info(f"提供PC版静态文件: {file_path}")
        return send_from_directory(app.static_folder, filename)
    except Exception as e:
        logger.error(f"访问静态文件失败: {str(e)}")
        return jsonify({'error': '访问静态文件失败'}), 500

def allowed_file(filename):
    """文件类型校验函数"""
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    # 记录文件扩展名用于调试
    logger.info(f"检查文件类型: {filename}, 扩展名: {ext}")
    return ext in ALLOWED_EXTENSIONS

def extract_shipping_info(text: str, api_key: str) -> Optional[Dict]:
    """
    调用GLM-4-flash大模型提取物流信息
    """
    try:
        # API端点
        url = GLM_API_URL
        
        # 请求头
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        # 构造系统提示词
        system_prompt = """你是一个专业的物流信息处理助手。用户输入的文本可能是从表格中复制的，存在多行文本，请通过你的理解从文本中准确提取以下信息：

# 输入类型识别
首先判断输入格式类型：
1. 表格型：包含日期、出仓地、传票号等多列数据，每行代表一个订单
2. 自由文本型：无表头直接描述订单信息

# 提取规则
## 通用规则
1. 地址提取到市级（例："四川省绵阳市游仙区游仙街道" → "四川省绵阳市"）
2. 重量提取规则
   - 表格型：根据表头位置提取重量，计算所有行的重量总和
   - 自由文本型仅识别以下格式的重量数值：
     * 数字+吨/T/t（示例：17.07吨、20T、15.5t），排除40个吨包，这种含有吨字但并非重量单位的数值
     * 正则模式：r'(\d+\.?\d*)\s*[吨Tt](?![a-zA-Z])' （排除类似"10TB"的干扰）
   - 总重量计算：
     * 表格型：提取每行中的重量，计算所有行的重量总和
     * 自由文本型：所有带吨/T/t单位数值之和
     
3. 方量提取规则
   - 表格型：根据表头位置提取方量，计算所有行的方量总和
   - 自由文本型仅识别以下格式的方量数值：
     * 数字+方/立方/m³/m3（示例：15.86方、20立方、15.5m³、12m3）
     * 正则模式：r'(\d+\.?\d*)\s*[方立m][³3]?(?![a-zA-Z])' （排除类似"10m32"的干扰）
   - 总方量计算：
     * 表格型：提取每行中的方量，计算所有行的方量总和
     * 自由文本型：所有带方量单位数值之和

# 特殊处理规则
1. 地址清洗：
   - 删除区级及以下信息（使用正则：/(.*?(省|市)).*?市/ → 取第一个匹配组）
   - 补全省份简称（例："川省" → "四川省"）

2. 重量处理：
   - 自由文本型提取所有数字（正则：\d+\.?\d*）
   - 超过32吨的数值视为异常值忽略

3. 方量处理：
   - 自由文本型提取所有数字（正则：\d+\.?\d*）
   - 超过50方的数值视为异常值忽略

# 输出JSON格式:
{
    "addresses": ["四川省绵阳市", "陕西省西安市"],  // 所有提取到的地址，去重后的列表
    "weight": 17.05,  // 总重量，数字类型
    "volume": 31.09,  // 总方量，数字类型
    "remark": "08:00-17:00，周天不收货，要求13米车型"  // 所有装卸要求
}"""

        # 请求体，修改response_format为JSON格式
        payload = {
            "model": "glm-4-flash",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        logger.info(f"API响应: {result}")
        
        # 尝试从tool_calls中提取
        extracted_info = None
        if "choices" in result and result["choices"]:
            # 首先尝试从tool_calls中提取
            tool_calls = result["choices"][0].get("message", {}).get("tool_calls", [])
            if tool_calls:
                args = tool_calls[0].get("function", {}).get("arguments")
                if args:
                    extracted_info = json.loads(args)
            
            # 如果tool_calls中没有数据，尝试从content中提取
            if extracted_info is None:
                content = result["choices"][0].get("message", {}).get("content", "")
                if content:
                    logger.info(f"尝试从文本内容提取: {content[:200]}...")
                    try:
                        # 尝试直接解析JSON对象
                        # 查找json对象的开始和结束位置
                        json_start = content.find('{')
                        json_end = content.rfind('}') + 1
                        if json_start >= 0 and json_end > json_start:
                            json_str = content[json_start:json_end]
                            extracted_info = json.loads(json_str)
                            logger.info(f"成功从文本中提取JSON: {extracted_info}")
                    except json.JSONDecodeError:
                        logger.warning(f"无法从文本直接解析JSON，尝试正则提取")
                        
                        # 使用正则表达式提取信息
                        addresses = []
                        # 提取地址，适配中文省市格式
                        addr_patterns = [
                            r'([^\s]+?省[^\s]+?市)',            # 标准格式：xx省xx市
                            r'([^\s]+?(省|市))',                # 单独的省或市
                            r'地址[：:]?\s*([^，。,\n]+[市])',   # 带"地址:"前缀
                        ]
                        
                        for pattern in addr_patterns:
                            addr_matches = re.findall(pattern, content)
                            if addr_matches:
                                for match in addr_matches:
                                    if isinstance(match, tuple):
                                        addr = match[0]
                                    else:
                                        addr = match
                                    if addr and len(addr) > 2 and "市" in addr:
                                        # 清洗地址，尝试提取省+市
                                        province_city_match = re.search(r'([^\s]+?省[^\s]+?市)', addr)
                                        if province_city_match:
                                            addr = province_city_match.group(1)
                                        addresses.append(addr)
                                
                        # 去重地址
                        if addresses:
                            addresses = list(set(addresses))
                        
                        # 提取重量
                        weight = 0
                        weight_patterns = [
                            r'总重量[：:]\s*(\d+\.?\d*)',
                            r'重量[：:]\s*(\d+\.?\d*)',
                            r'(\d+\.?\d*)\s*吨',
                            r'(\d+\.?\d*)[Tt]'
                        ]
                        
                        for pattern in weight_patterns:
                            weight_matches = re.findall(pattern, content)
                            if weight_matches:
                                for match in weight_matches:
                                    try:
                                        weight += float(match)
                                    except ValueError:
                                        pass
                        
                        # 提取方量
                        volume = 0
                        volume_patterns = [
                            r'总方量[：:]\s*(\d+\.?\d*)',
                            r'方量[：:]\s*(\d+\.?\d*)',
                            r'(\d+\.?\d*)\s*[方立m][³3]?(?![a-zA-Z])'
                        ]
                        
                        for pattern in volume_patterns:
                            volume_matches = re.findall(pattern, content)
                            if volume_matches:
                                for match in volume_matches:
                                    try:
                                        volume += float(match)
                                    except ValueError:
                                        pass
                        
                        # 提取备注
                        remark = ""
                        remark_patterns = [
                            r'装卸要求[：:]\s*([^\n]+)',
                            r'注意事项[：:]\s*([^\n]+)',
                            r'要求[：:]\s*([^\n]+)',
                            r'备注[：:]\s*([^\n]+)'
                        ]
                        
                        for pattern in remark_patterns:
                            remark_match = re.search(pattern, content)
                            if remark_match:
                                remark = remark_match.group(1).strip()
                                break
                        
                        # 如果没有找到备注，但内容中含有特定关键词，也尝试提取
                        if not remark:
                            keywords = ['米车型', '周天不收货', '装卸时间', '收货时间']
                            for keyword in keywords:
                                if keyword in content:
                                    # 查找包含关键词的整句
                                    sentence_match = re.search(r'[^。，,.!?！？\n]*' + keyword + r'[^。，,.!?！？\n]*', content)
                                    if sentence_match:
                                        remark = sentence_match.group(0).strip()
                                        break
                        
                        extracted_info = {
                            "addresses": addresses,
                            "weight": weight,
                            "volume": volume,
                            "remark": remark
                        }
                        logger.info(f"通过正则提取信息: {extracted_info}")
        
        # 如果以上方法都没有提取到信息，返回None
        if extracted_info:
            logger.info(f"提取的信息: {extracted_info}")
            return extracted_info
        else:
            logger.warning("未找到有效信息")
            return None
        
    except requests.exceptions.RequestException as e:
        logger.error(f"API请求失败: {str(e)}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"响应解析失败: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"提取物流信息时发生未知错误: {str(e)}")
        return None

def ocr_processing(image_path):
    """调用OCR接口获取识别结果"""
    try:
        # 检查文件是否存在
        if not os.path.exists(image_path):
            logger.error(f"文件不存在: {image_path}")
            return []
            
        # 检查文件扩展名
        file_extension = os.path.splitext(image_path)[1].lower()
        if file_extension not in ['.jpg', '.jpeg', '.png']:
            logger.error(f"不支持的文件类型: {file_extension}")
            return []
            
        # 检查文件大小
        file_size = os.path.getsize(image_path)
        if file_size == 0:
            logger.error(f"文件大小为0: {image_path}")
            return []
            
        # 打开文件并发送请求
        with open(image_path, 'rb') as f:
            # 获取文件的二进制数据
            file_data = f.read()
            logger.info(f"文件大小: {len(file_data)} 字节")
            
            # 创建文件对象
            files = {'files': (os.path.basename(image_path), file_data, 'image/jpeg' if file_extension in ['.jpg', '.jpeg'] else 'image/png')}
            
            # 发送请求
            response = requests.post(OCR_API_URL, data=OCR_CREDENTIALS, files=files, timeout=10)
            response.raise_for_status()
        
        result = response.json()
        logger.info(f"OCR API返回结果: {result}")  # 添加日志
        
        # 检查是否有错误
        if result.get('success') is False or result.get('error') is True:
            error_msg = result.get('resultMessage', '未知错误')
            logger.error(f"OCR API返回错误: {error_msg}")
            return []
            
        # 确保values存在后再尝试访问
        if not result.get('values'):
            logger.error("OCR API返回结果中缺少values字段")
            return []
            
        texts = result.get('values', {}).get('data', [{}])[0].get('TextDetections', [])
        ocr_texts = [text_info.get('DetectedText', '') for text_info in texts]
        logger.info(f"OCR识别文本: {ocr_texts}")  # 添加日志
        return ocr_texts
    except requests.exceptions.RequestException as e:
        logger.error(f"OCR API请求失败: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"OCR处理失败: {str(e)}")
        return []

@app.route('/process-text', methods=['POST'])
def process_text():
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            logger.error("未提供文本内容")
            return jsonify({'error': '未提供文本内容'}), 400
            
        text_content = data['text']
        logger.info(f"处理文本: {text_content[:100]}...")  # 记录前100个字符
        shipping_info = extract_shipping_info(text_content, API_KEY)
        
        logger.info(f"提取到的信息: {shipping_info}")
        
        if shipping_info:
            # 确保weight是数字类型，如果不是则转换为空字符串
            weight = shipping_info.get("weight", "")
            if weight is None:
                weight = ""
            
            # 处理新增的方量字段    
            volume = shipping_info.get("volume", "")
            if volume is None:
                volume = ""
                
            # 确保addresses是列表类型
            addresses = shipping_info.get("addresses", [])
            if not isinstance(addresses, list):
                addresses = []
                
            # 构建返回对象，包含方量
            details = {
                "weight": str(weight),  # 确保重量是字符串
                "volume": str(volume),  # 确保方量是字符串
                "location": ",".join(addresses),  # 使用逗号连接地址列表
                "notes": shipping_info.get("remark", "")
            }
            
            logger.info(f"返回结果: {details}")
        else:
            logger.warning("未能提取到有效信息")
            details = {
                "weight": "",
                "volume": "",  # 空方量
                "location": "",
                "notes": ""
            }
        return jsonify(details)
    except Exception as e:
        logger.error(f"处理文本时发生错误: {str(e)}")
        return jsonify({'error': '处理文本失败', 'details': str(e)}), 500

def filter_vehicle_info(vehicle_info):
    """
    对车辆信息进行映射，使用新的映射规则：
    - 车辆类型：重型仓栅式半挂车->高栏，轻型仓栅式货车->高栏，其余->空
    - 尺寸：含5995->4.2米，含13000->13米，其余->空
    
    Args:
        vehicle_info: 包含车辆信息的字典
        
    Returns:
        映射后的车辆信息字典
    """
    # 记录原始数据
    logger.info(f"接收到的原始车辆类型数组: {vehicle_info.get('vehicle_type', [])}")
    logger.info(f"接收到的原始尺寸数组: {vehicle_info.get('dimensions', [])}")
    
    # 深拷贝避免修改原始数据
    mapped_info = vehicle_info.copy()
    
    # 车辆类型映射规则
    type_mapping = {
        "重型仓栅式半挂车": "高栏",
        "轻型仓栅式货车": "高栏"
    }
    
    # 对车辆类型进行映射
    if 'vehicle_type' in mapped_info and isinstance(mapped_info['vehicle_type'], list):
        mapped_types = []
        for vt in mapped_info['vehicle_type']:
            # 获取映射结果，如果不在映射规则中则为空字符串
            mapped_type = type_mapping.get(vt, "")
            if mapped_type:
                mapped_types.append(mapped_type)
        
        mapped_info['vehicle_type'] = mapped_types
        logger.info(f"映射后的车辆类型: {mapped_info['vehicle_type']}")
    
    # 对尺寸进行映射
    if 'dimensions' in mapped_info and isinstance(mapped_info['dimensions'], list):
        mapped_dimensions = []
        for dim in mapped_info['dimensions']:
            # 根据尺寸字符串包含的数字进行映射
            if "5995" in dim:
                mapped_dimensions.append("4.2米")
            elif "13000" in dim:
                mapped_dimensions.append("13米")
            # 其他尺寸不添加到映射结果中
        
        mapped_info['dimensions'] = mapped_dimensions
        logger.info(f"映射后的尺寸: {mapped_info['dimensions']}")
    
    return mapped_info

@app.route('/process-documents', methods=['POST'])
def process_documents():
    try:
        # 初始化结果
        driver_info = {}
        vehicle_info = {
            'plate_number': [],
            'vehicle_type': [],
            'dimensions': [],
            'vin_code': [],
            'engine_number': ''
        }
        
        # 处理驾驶证文件
        driver_files = request.files.getlist('driver_files')
        for file in driver_files:
            if file.filename == '' or not allowed_file(file.filename):
                continue
                
            # 保存文件，保留原始扩展名
            original_filename = file.filename
            ext = os.path.splitext(original_filename)[1].lower()
            safe_filename = secure_filename(original_filename)
            
            # 如果secure_filename丢失了扩展名，手动添加回去
            if not safe_filename.endswith(('.jpg', '.jpeg', '.png')):
                safe_filename = safe_filename + ext
                
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
            logger.info(f"保存驾驶证文件: 原始名称={original_filename}, 安全名称={safe_filename}, 路径={filepath}")
            file.save(filepath)
            
            # 记录文件大小和类型信息，用于调试
            file_size = os.path.getsize(filepath)
            file_extension = os.path.splitext(safe_filename)[1].lower()
            logger.info(f"处理驾驶证文件: {safe_filename}, 大小: {file_size} 字节, 扩展名: {file_extension}")

            # 对图片进行OCR识别
            ocr_result = ocr_processing(filepath)
            if not ocr_result:
                logger.warning(f"文件 {safe_filename} OCR识别结果为空") 
                os.remove(filepath)  # 清理临时文件
                continue

            # 使用GLM提取字段
            extracted_info = extract_info_with_glm(ocr_result)
            logger.info(f"驾驶证文件 {safe_filename} 提取的信息: {extracted_info}")
            
            # 合并提取的信息 - 保留已有信息并添加新信息
            if extracted_info.get('driver'):
                # 对于驾驶证的每个字段，只在当前为空时更新
                if not driver_info.get('name') and extracted_info['driver'].get('name'):
                    driver_info['name'] = extracted_info['driver']['name']
                if not driver_info.get('license_number') and extracted_info['driver'].get('license_number'):
                    driver_info['license_number'] = extracted_info['driver']['license_number']
                if not driver_info.get('validity_period') and extracted_info['driver'].get('validity_period'):
                    driver_info['validity_period'] = extracted_info['driver']['validity_period']
                    
                # 对于有效性，只有当前无效或未设置时，才接受有效状态
                if driver_info.get('is_valid') is not True and extracted_info['driver'].get('is_valid') is True:
                    driver_info['is_valid'] = True
                elif 'is_valid' not in driver_info and 'is_valid' in extracted_info['driver']:
                    driver_info['is_valid'] = extracted_info['driver']['is_valid']

            # 删除临时文件
            os.remove(filepath)
            
        # 处理行驶证文件
        vehicle_files = request.files.getlist('vehicle_files')
        for file in vehicle_files:
            if file.filename == '' or not allowed_file(file.filename):
                continue
                
            # 保存文件，保留原始扩展名
            original_filename = file.filename
            ext = os.path.splitext(original_filename)[1].lower()
            safe_filename = secure_filename(original_filename)
            
            # 如果secure_filename丢失了扩展名，手动添加回去
            if not safe_filename.endswith(('.jpg', '.jpeg', '.png')):
                safe_filename = safe_filename + ext
                
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
            logger.info(f"保存行驶证文件: 原始名称={original_filename}, 安全名称={safe_filename}, 路径={filepath}")
            file.save(filepath)
            
            # 记录文件大小和类型信息，用于调试
            file_size = os.path.getsize(filepath)
            file_extension = os.path.splitext(safe_filename)[1].lower()
            logger.info(f"处理行驶证文件: {safe_filename}, 大小: {file_size} 字节, 扩展名: {file_extension}")

            # 对图片进行OCR识别
            ocr_result = ocr_processing(filepath)
            if not ocr_result:
                logger.warning(f"文件 {safe_filename} OCR识别结果为空") 
                os.remove(filepath)  # 清理临时文件
                continue

            # 使用GLM提取字段
            extracted_info = extract_info_with_glm(ocr_result)
            logger.info(f"行驶证文件 {safe_filename} 提取的信息: {extracted_info}")
            
            # 合并提取的信息 - 累加新的识别结果
            if extracted_info.get('vehicle'):
                # 处理车牌号
                if extracted_info['vehicle'].get('plate_number'):
                    plate_numbers = extracted_info['vehicle'].get('plate_number')
                    if isinstance(plate_numbers, list):
                        for plate in plate_numbers:
                            if plate and plate not in vehicle_info['plate_number']:
                                vehicle_info['plate_number'].append(plate)
                    else:
                        if plate_numbers and plate_numbers not in vehicle_info['plate_number']:
                            vehicle_info['plate_number'].append(plate_numbers)
                
                # 处理车辆识别代码
                if extracted_info['vehicle'].get('vin_code'):
                    vin_codes = extracted_info['vehicle'].get('vin_code')
                    if isinstance(vin_codes, list):
                        for vin in vin_codes:
                            if vin and vin not in vehicle_info['vin_code']:
                                vehicle_info['vin_code'].append(vin)
                    else:
                        if vin_codes and vin_codes not in vehicle_info['vin_code']:
                            vehicle_info['vin_code'].append(vin_codes)
                
                # 处理发动机号
                if not vehicle_info.get('engine_number') and extracted_info['vehicle'].get('engine_number'):
                    vehicle_info['engine_number'] = extracted_info['vehicle'].get('engine_number')
                
                # 对于其他字段，只在当前为空时更新
                for key, value in extracted_info['vehicle'].items():
                    if key not in ['plate_number', 'vin_code', 'engine_number'] and value and not vehicle_info.get(key):
                        vehicle_info[key] = value

            # 删除临时文件
            os.remove(filepath)
            
        # 也处理从单个文件上传的情况（兼容旧版API）
        files = request.files.getlist('files')
        if files and len(files) > 0:
            license_type = request.form.get('licenseType', 'vehicle')  # 默认处理行驶证
            
            for file in files:
                if file.filename == '' or not allowed_file(file.filename):
                    continue
                    
                # 保存文件，保留原始扩展名
                original_filename = file.filename
                ext = os.path.splitext(original_filename)[1].lower()
                safe_filename = secure_filename(original_filename)
                
                # 如果secure_filename丢失了扩展名，手动添加回去
                if not safe_filename.endswith(('.jpg', '.jpeg', '.png')):
                    safe_filename = safe_filename + ext
                    
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
                logger.info(f"保存单个文件: 原始名称={original_filename}, 安全名称={safe_filename}, 路径={filepath}, 类型={license_type}")
                file.save(filepath)
                
                # 对图片进行OCR识别
                ocr_result = ocr_processing(filepath)
                if not ocr_result:
                    logger.warning(f"文件 {safe_filename} OCR识别结果为空") 
                    os.remove(filepath)  # 清理临时文件
                    continue
    
                # 使用GLM提取字段
                extracted_info = extract_info_with_glm(ocr_result)
                logger.info(f"单个文件 {safe_filename} 提取的信息: {extracted_info}")
                
                # 根据证件类型更新不同的信息
                if license_type == 'driver' and extracted_info.get('driver'):
                    # 对于驾驶证的每个字段，只在当前为空时更新
                    if not driver_info.get('name') and extracted_info['driver'].get('name'):
                        driver_info['name'] = extracted_info['driver']['name']
                    if not driver_info.get('license_number') and extracted_info['driver'].get('license_number'):
                        driver_info['license_number'] = extracted_info['driver']['license_number']
                    if not driver_info.get('validity_period') and extracted_info['driver'].get('validity_period'):
                        driver_info['validity_period'] = extracted_info['driver']['validity_period']
                        
                    # 对于有效性，只有当前无效或未设置时，才接受有效状态
                    if driver_info.get('is_valid') is not True and extracted_info['driver'].get('is_valid') is True:
                        driver_info['is_valid'] = True
                    elif 'is_valid' not in driver_info and 'is_valid' in extracted_info['driver']:
                        driver_info['is_valid'] = extracted_info['driver']['is_valid']
                elif license_type == 'vehicle' and extracted_info.get('vehicle'):
                    # 处理车牌号
                    if extracted_info['vehicle'].get('plate_number'):
                        plate_numbers = extracted_info['vehicle'].get('plate_number')
                        if isinstance(plate_numbers, list):
                            for plate in plate_numbers:
                                if plate and plate not in vehicle_info['plate_number']:
                                    vehicle_info['plate_number'].append(plate)
                        else:
                            if plate_numbers and plate_numbers not in vehicle_info['plate_number']:
                                vehicle_info['plate_number'].append(plate_numbers)
                    
                    # 处理车辆识别代码
                    if extracted_info['vehicle'].get('vin_code'):
                        vin_codes = extracted_info['vehicle'].get('vin_code')
                        if isinstance(vin_codes, list):
                            for vin in vin_codes:
                                if vin and vin not in vehicle_info['vin_code']:
                                    vehicle_info['vin_code'].append(vin)
                        else:
                            if vin_codes and vin_codes not in vehicle_info['vin_code']:
                                vehicle_info['vin_code'].append(vin_codes)
                    
                    # 处理发动机号
                    if not vehicle_info.get('engine_number') and extracted_info['vehicle'].get('engine_number'):
                        vehicle_info['engine_number'] = extracted_info['vehicle'].get('engine_number')
                    
                    # 对于其他字段，只在当前为空时更新
                    for key, value in extracted_info['vehicle'].items():
                        if key not in ['plate_number', 'vin_code', 'engine_number'] and value and not vehicle_info.get(key):
                            vehicle_info[key] = value
                
                # 删除临时文件
                os.remove(filepath)

        logger.info(f"最终合并结果: driver={driver_info}, vehicle={vehicle_info}")
        
        # 过滤车辆信息，只保留指定的车辆类型和尺寸
        filtered_vehicle_info = filter_vehicle_info(vehicle_info)
        logger.info(f"过滤后的车辆信息: {filtered_vehicle_info}")
        
        # 返回合并后的结果
        return jsonify({
            'driver': driver_info,
            'vehicle': filtered_vehicle_info
        })

    except Exception as e:
        logger.error(f"处理文件时出错: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

def check_license_validity(validity_text):
    """检查证件是否有效"""
    try:
        # 处理"至长期"的情况
        if "至长期" in validity_text:
            return True
            
        # 提取日期部分
        dates = re.findall(r'\d{4}[-年]\d{1,2}[-月]\d{1,2}', validity_text)
        if len(dates) != 2:
            return False
            
        # 转换日期格式
        start_date = datetime.strptime(dates[0].replace('年', '-').replace('月', '-'), '%Y-%m-%d')
        end_date = datetime.strptime(dates[1].replace('年', '-').replace('月', '-'), '%Y-%m-%d')
        
        # 获取当前日期
        current_date = datetime.now()
        
        # 判断是否在有效期内
        return start_date <= current_date <= end_date
    except Exception as e:
        logger.error(f"检查证件有效期时出错: {str(e)}")
        return False

def extract_info_with_glm(text):
    """使用GLM提取信息，不区分证件类型"""
    # 将文本列表转换为字符串
    text_content = '\n'.join(text) if isinstance(text, list) else text
    logger.info(f"处理文本内容: {text_content}")
    
    system_prompt = """你是一个专业的证件信息提取助手。请严格按照以下规则从OCR识别的文本中提取信息：

1. 驾驶证信息提取规则：
   - 姓名：必须是2-4个汉字的中文姓名
   - 身份证号：必须是18位数字，格式为：前6位地区码 + 8位出生日期 + 4位顺序码
   - 有效期：必须是以下格式之一
     * YYYY年MM月DD日至YYYY年MM月DD日
     * YYYY年MM月DD日至长期
     * YYYY-MM-DD至YYYY-MM-DD
     * YYYY-MM-DD至长期

2. 行驶证信息提取规则：
   - 车牌号码：必须满足以下格式之一
     * 省份简称+字母+5位或6位字母数字组合（常规车牌）
     * 省份简称+字母+4位字母数字组合+挂字（挂车车牌）
     * 军队车牌（以"军"或"WJ"开头）
     * 警用车牌（以"警"或"WJ"开头）
     * 注意：可能存在多个车牌号，需全部提取
   - 车辆类型：提取文本中所有出现的车辆类型
     * 例如：轻型厢式货车、重型厢式货车、轻型仓栅式货车、重型仓栅式货车、重型仓栅式半挂车等
     * 返回原始车辆类型文本数组，不做映射
   - 外廓尺寸：提取文本中所有出现的外廓尺寸
     * 例如：5995×2200×3000mm、13000×2550×3300mm等
     * 返回原始尺寸文本数组，不做映射
   - 车辆识别代码：必须是17位字母数字组合，通常以字母开头，排除字母I、O和Q
     * 注意：可能存在多个车辆识别代码，需全部提取
   - 发动机号：发动机号是发动机的唯一编号，通常是由字母和数字组成的组合，长度不固定但通常5-12位
     * 注意：只返回找到的第一个发动机号，以字符串格式返回
   - 能源类型：必须是以下选项之一：汽油/柴油/天然气/氢气/电/其他

提取逻辑：
1. 对于"车辆识别代码"（VIN码），查找以下类型的文本：
   - 查找文本中包含"车辆识别代号"或"VIN"附近的字母数字组合
   - 识别满足17位长度且不包含I、O、Q字母的字母数字组合
   - 可能出现在"车架号"或"车辆识别代码"等字样后面
   - 如果有多个符合条件的代码，全部提取并以数组形式返回

2. 对于"发动机号"，查找以下类型的文本：
   - 查找文本中包含"发动机号"或"发动机号码"附近的组合
   - 发动机号通常由字母和数字组成，可能有特殊格式如"JxxxxDA12345"格式
   - 特别注意区分发动机号与VIN码的区别
   - 只返回找到的第一个发动机号，以字符串形式返回

3. 对于"车牌号"，查找以下类型的文本：
   - 查找符合上述车牌格式规则的文本
   - 车牌号通常出现在"号牌号码"或"车牌号码"等字样后面
   - 如果有多个符合条件的车牌号，全部提取并以数组形式返回

4. 对于"车辆类型"，提取原始文本中提到的所有车辆类型：
   - 如果文本中包含"轻型厢式货车"、"重型厢式货车"等类型，直接提取原始文本
   - 不要做任何映射，返回所有识别出的车辆类型文本数组
   - 将车辆类型文本数组原样返回，后续处理会进行映射和过滤

5. 对于"外廓尺寸"，提取原始文本中提到的所有尺寸：
   - 如果文本中包含"5995×2200×3000mm"、"13000×2550×3300mm"等尺寸，直接提取原始文本
   - 不要做任何映射，返回所有识别出的尺寸文本数组
   - 将尺寸文本数组原样返回，后续处理会进行映射和过滤

请严格按照JSON格式返回结果，格式如下：
{
    "driver": {
        "name": "司机姓名",
        "license_number": "身份证号",
        "validity_period": "有效期"
    },
    "vehicle": {
        "plate_number": ["车牌号1", "车牌号2"],
        "vehicle_type": ["轻型厢式货车", "重型仓栅式货车"],
        "dimensions": ["5995×2200×3000mm", "13000×2550×3300mm"],
        "vin_code": ["车辆识别代码1", "车辆识别代码2"],
        "engine_number": "发动机号",
        "energy_type": "能源类型"
    }
}

注意：
1. 对于可能出现多个值的字段（如车牌号、车辆识别代码），使用数组格式返回
2. 发动机号使用字符串格式返回，只返回第一个找到的发动机号
3. 所有字段如果无法识别或格式不符合要求，返回空字符串或空数组
4. 必须严格按照规则验证和格式化每个字段
5. 确保提取的信息准确性和完整性
6. 特别注意vin_code和engine_number的区分，它们有不同的长度和格式特征
7. 车辆类型和尺寸保留原始文本，不进行映射"""

    user_prompt = f"""请从以下OCR识别的文本中提取相关信息：

文本内容：
{text_content}

请严格按照规则提取并返回JSON格式的结果。"""

    try:
        logger.info(f"开始调用GLM提取信息，输入文本: {text_content}")
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "glm-4-flash",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        response = requests.post(GLM_API_URL, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        result = response.json()
        
        logger.info(f"GLM API返回结果: {result}")
        
        # 解析GLM返回的JSON
        extracted_info = json.loads(result['choices'][0]['message']['content'])
        
        # 判断证件是否有效
        is_valid = False
        if 'driver' in extracted_info and extracted_info['driver'].get('validity_period'):
            validity_text = extracted_info['driver']['validity_period']
            is_valid = check_license_validity(validity_text)
            logger.info(f"提取到的有效期: {validity_text}, 是否有效: {is_valid}")
        
        # 添加证件状态
        if 'driver' in extracted_info:
            extracted_info['driver']['is_valid'] = is_valid
            
        logger.info(f"解析后的提取信息: {extracted_info}")
        
        # 注释掉这里的filter_vehicle_info调用，避免重复过滤
        # if 'vehicle' in extracted_info:
        #     extracted_info['vehicle'] = filter_vehicle_info(extracted_info['vehicle'])
        #     logger.info(f"过滤后的车辆信息: {extracted_info['vehicle']}")
        
        return extracted_info
    except Exception as e:
        logger.error(f"GLM提取信息时出错: {str(e)}")
        return {
            'driver': {
                'name': '',
                'license_number': '',
                'validity_period': '',
                'is_valid': False
            },
            'vehicle': {
                'plate_number': [],
                'vehicle_type': [],
                'dimensions': [],
                'vin_code': [],
                'engine_number': '',
                'energy_type': ''
            }
        }

@app.route('/mobile')
def mobile_index():
    try:
        logger.info("访问移动端首页")
        
        # 确定正确的移动端首页路径
        mobile_index_path = os.path.join(BASE_DIR, 'mobile/templates/mobile_index.html')
        
        # 检查文件是否存在
        if not os.path.exists(mobile_index_path):
            logger.error(f"移动端首页文件不存在: {mobile_index_path}")
            return jsonify({'error': '移动端首页文件不存在'}), 404
        
        # 记录详细的路径信息，帮助调试
        logger.info(f"移动端首页路径: {mobile_index_path}")
        logger.info(f"目录: {os.path.dirname(mobile_index_path)}")
        logger.info(f"文件名: {os.path.basename(mobile_index_path)}")
        
        # 使用send_from_directory提供文件
        return send_from_directory(
            os.path.dirname(mobile_index_path), 
            os.path.basename(mobile_index_path)
        )
    except Exception as e:
        logger.error(f"访问移动端首页失败: {str(e)}")
        return jsonify({'error': f'访问移动端首页失败: {str(e)}'}), 500

@app.route('/mobile/static/<path:filename>')
def serve_mobile_static(filename):
    try:
        mobile_static_path = os.path.join(BASE_DIR, 'mobile/static')
        
        logger.info(f"请求移动端静态文件: {filename}")
        logger.info(f"查找路径: {os.path.join(mobile_static_path, filename)}")
        
        # 检查文件是否存在
        if not os.path.exists(os.path.join(mobile_static_path, filename)):
            logger.error(f"移动端静态文件不存在: {filename}")
            return jsonify({'error': f'文件不存在: {filename}'}), 404
        
        return send_from_directory(mobile_static_path, filename)
    except Exception as e:
        logger.error(f"访问移动端静态文件失败: {str(e)}")
        return jsonify({'error': f'访问静态文件失败: {str(e)}'}), 500
    
if __name__ == "__main__":
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['IMAGE_TEST_FOLDER'] = 'OCR测试图片'
    app.run(debug=True, host='0.0.0.0')