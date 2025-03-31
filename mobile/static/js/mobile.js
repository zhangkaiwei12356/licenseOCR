// 等待文档加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 定义Vue实例
    new Vue({
        el: '#app',
        data() {
            // 创建当前日期对象
            const now = new Date();
            const currentYear = now.getFullYear();
            
            return {
                inputText: '',
                driverLicenseImages: [],
                vehicleLicenseImages: [],
                orderProgress: 0,
                orderProgressText: '',
                orderInfo: {
                    weight: '',
                    volume: '',
                    location: '',
                    notes: '',
                    price: '',
                    remark: '',
                    arrivalTime: '',
                    projectName: ''
                },
                // 到厂时间选择器数据
                arrivalTimeData: {
                    year: currentYear,
                    month: now.getMonth() + 1,
                    day: now.getDate(),
                    hour: now.getHours()
                },
                arrivalTimeYears: [currentYear - 1, currentYear, currentYear + 1],
                validStatus: ['有效', '无效'],
                licenseInfo: {
                    driverName: '',
                    idNumber: '',
                    isValid: '',
                    plateNumber: '',
                    vehicleType: '',
                    vehicleSize: '',
                    axleCount: '',
                    phoneNumber: '',
                    vinCode: '',
                    engineNumber: '',
                    energyType: ''
                },
                mergedInfo: '',
                // 移动端特有的状态
                isProcessing: false,
                showToast: false,
                toastMessage: '',
                toastType: 'success',
                pullRefreshDistance: 0,
                isPulling: false,
                axleOptions: ['2轴', '3轴', '4轴', '5轴', '6轴'],
                energyTypes: ['汽油', '柴油', '天然气', '氢气', '电', '新能源/电','其他']
            }
        },
        computed: {
            // 格式化到厂时间
            formattedArrivalTime() {
                const { year, month, day, hour } = this.arrivalTimeData;
                if (year && month && day && hour !== undefined) {
                    return `${year}年${month}月${day}日${hour}点`;
                }
                return '';
            }
        },
        watch: {
            // 监听到厂时间数据变化
            arrivalTimeData: {
                handler(newVal) {
                    this.orderInfo.arrivalTime = this.formattedArrivalTime;
                },
                deep: true,
                immediate: true
            }
        },
        methods: {
            // 显示提示信息
            showToastMessage(message, type = 'success') {
                // 使用WeUI的toast
                const toast = document.createElement('div');
                toast.className = `weui-toast ${type === 'success' ? 'weui-toast_success' : 'weui-toast_text'}`;
                toast.innerHTML = `
                    ${type === 'success' ? '<i class="weui-icon_toast weui-icon-success-no-circle"></i>' : ''}
                    <p class="weui-toast__content">${message}</p>
                `;
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    document.body.removeChild(toast);
                }, 2000);
            },

            // 显示加载提示
            showLoading(text = '处理中') {
                const loading = document.createElement('div');
                loading.className = 'weui-loading_toast';
                loading.innerHTML = `
                    <div class="weui-mask_transparent"></div>
                    <div class="weui-toast">
                        <i class="weui-loading weui-icon_toast"></i>
                        <p class="weui-toast__content">${text}</p>
                    </div>
                `;
                document.body.appendChild(loading);
                return loading;
            },

            // 隐藏加载提示
            hideLoading(loading) {
                if (loading && loading.parentNode) {
                    loading.parentNode.removeChild(loading);
                }
            },

            // 显示确认对话框
            showConfirm(title, content) {
                return new Promise((resolve, reject) => {
                    const dialog = document.createElement('div');
                    dialog.className = 'weui-dialog';
                    dialog.innerHTML = `
                        <div class="weui-mask"></div>
                        <div class="weui-dialog">
                            <div class="weui-dialog__hd"><strong class="weui-dialog__title">${title}</strong></div>
                            <div class="weui-dialog__bd">${content}</div>
                            <div class="weui-dialog__ft">
                                <a href="javascript:;" class="weui-dialog__btn weui-dialog__btn_default">取消</a>
                                <a href="javascript:;" class="weui-dialog__btn weui-dialog__btn_primary">确定</a>
                            </div>
                        </div>
                    `;
                    
                    document.body.appendChild(dialog);
                    
                    const btns = dialog.querySelectorAll('.weui-dialog__btn');
                    btns[0].onclick = () => {
                        document.body.removeChild(dialog);
                        reject();
                    };
                    btns[1].onclick = () => {
                        document.body.removeChild(dialog);
                        resolve();
                    };
                });
            },

            // 选择驾驶证图片
            async chooseDriverLicenseImages() {
                try {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/jpeg,image/jpg,image/png';
                    input.multiple = true; // 允许选择多张图片
                    // 移除capture属性，允许从图库选择
                    // input.capture = 'camera';  
                    
                    input.onchange = async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        
                        const loading = this.showLoading('准备处理图片...');
                        
                        try {
                            // 清除现有图片
                            this.driverLicenseImages = [];
                            
                            // 处理每一张选择的图片
                            for (let i = 0; i < files.length; i++) {
                                const file = files[i];
                                
                                if (file.size > 16 * 1024 * 1024) {
                                    this.showToastMessage(`文件 ${file.name} 过大，请选择小于16MB的图片`, 'error');
                                    continue;
                                }
                                
                                this.hideLoading(loading);
                                const compressLoading = this.showLoading(`压缩图片 ${i+1}/${files.length}...`);
                                
                                try {
                                    const compressedFile = await this.compressImage(file);
                                    const url = URL.createObjectURL(compressedFile);
                                    
                                    this.driverLicenseImages.push({
                                        url,
                                        status: 'uploading',
                                        statusText: '待上传',
                                        file: compressedFile,
                                        name: file.name,
                                        type: 'driver'
                                    });
                                } finally {
                                    this.hideLoading(compressLoading);
                                }
                            }
                            
                            // 如果有图片需要上传
                            if (this.driverLicenseImages.length > 0) {
                                const uploadLoading = this.showLoading('上传图片中...');
                                try {
                                    await this.uploadDriverLicenseImages();
                                } finally {
                                    this.hideLoading(uploadLoading);
                                }
                            }
                        } catch (error) {
                            console.error('处理驾驶证图片失败:', error);
                            this.showToastMessage('处理图片失败: ' + error.message, 'error');
                        } finally {
                            this.hideLoading(loading);
                        }
                    };
                    
                    input.click();
                } catch (error) {
                    console.error('选择图片失败:', error);
                    this.showToastMessage('选择图片失败: ' + error.message, 'error');
                }
            },

            // 选择行驶证图片
            async chooseVehicleLicenseImages() {
                try {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/jpeg,image/jpg,image/png';
                    input.multiple = true; // 允许选择多张图片
                    // 移除capture属性，允许从图库选择
                    // input.capture = 'camera';
                    
                    input.onchange = async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        
                        const loading = this.showLoading('准备处理图片...');
                        
                        try {
                            // 清除现有图片
                            this.vehicleLicenseImages = [];
                            
                            // 处理每一张选择的图片
                            for (let i = 0; i < files.length; i++) {
                                const file = files[i];
                                
                                if (file.size > 16 * 1024 * 1024) {
                                    this.showToastMessage(`文件 ${file.name} 过大，请选择小于16MB的图片`, 'error');
                                    continue;
                                }
                                
                                this.hideLoading(loading);
                                const compressLoading = this.showLoading(`压缩图片 ${i+1}/${files.length}...`);
                                
                                try {
                                    const compressedFile = await this.compressImage(file);
                                    const url = URL.createObjectURL(compressedFile);
                                    
                                    this.vehicleLicenseImages.push({
                                        url,
                                        status: 'uploading',
                                        statusText: '待上传',
                                        file: compressedFile,
                                        name: file.name,
                                        type: 'vehicle'
                                    });
                                } finally {
                                    this.hideLoading(compressLoading);
                                }
                            }
                            
                            // 如果有图片需要上传
                            if (this.vehicleLicenseImages.length > 0) {
                                const uploadLoading = this.showLoading('上传图片中...');
                                try {
                                    await this.uploadVehicleLicenseImages();
                                } finally {
                                    this.hideLoading(uploadLoading);
                                }
                            }
                        } catch (error) {
                            console.error('处理行驶证图片失败:', error);
                            this.showToastMessage('处理图片失败: ' + error.message, 'error');
                        } finally {
                            this.hideLoading(loading);
                        }
                    };
                    
                    input.click();
                } catch (error) {
                    console.error('选择图片失败:', error);
                    this.showToastMessage('选择图片失败: ' + error.message, 'error');
                }
            },

            // 压缩图片
            async compressImage(file) {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = (e) => {
                        const img = new Image();
                        img.src = e.target.result;
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            let width = img.width;
                            let height = img.height;
                            const maxSize = 1200;
                            
                            if (width > height && width > maxSize) {
                                height = (height * maxSize) / width;
                                width = maxSize;
                            } else if (height > maxSize) {
                                width = (width * maxSize) / height;
                                height = maxSize;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            canvas.toBlob((blob) => {
                                resolve(new File([blob], file.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now()
                                }));
                            }, 'image/jpeg', 0.8);
                        };
                    };
                });
            },

            // 上传驾驶证图片
            async uploadDriverLicenseImages() {
                if (this.driverLicenseImages.length === 0) return;
                
                // 更新所有图片状态为上传中
                this.driverLicenseImages.forEach(image => {
                    image.status = 'processing';
                    image.statusText = '上传中...';
                });
                
                try {
                    // 创建FormData对象
                    const formData = new FormData();
                    
                    // 添加所有图片到FormData
                    this.driverLicenseImages.forEach(image => {
                        formData.append('driver_files', image.file, image.name);
                    });
                    
                    // 发送请求
                    const response = await fetch('/process-documents', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`上传失败: ${response.status} ${errorText}`);
                    }
                    
                    const result = await response.json();
                    
                    // 更新所有图片状态为成功
                    this.driverLicenseImages.forEach(image => {
                        image.status = 'success';
                        image.statusText = '识别成功';
                    });
                    
                    // 更新驾驶证信息
                    if (result.driver) {
                        Object.assign(this.licenseInfo, {
                            driverName: result.driver.name || this.licenseInfo.driverName,
                            idNumber: result.driver.license_number || this.licenseInfo.idNumber,
                            isValid: result.driver.is_valid ? '有效' : '无效'
                        });
                    }
                    
                    this.showToastMessage(`成功上传并识别 ${this.driverLicenseImages.length} 张驾驶证图片`);
                } catch (error) {
                    console.error('上传驾驶证失败:', error);
                    
                    // 更新所有图片状态为失败
                    this.driverLicenseImages.forEach(image => {
                        image.status = 'error';
                        image.statusText = '上传失败';
                    });
                    
                    this.showToastMessage('上传驾驶证失败: ' + error.message, 'error');
                }
            },

            // 上传行驶证图片
            async uploadVehicleLicenseImages() {
                if (this.vehicleLicenseImages.length === 0) return;
                
                // 更新所有图片状态为上传中
                this.vehicleLicenseImages.forEach(image => {
                    image.status = 'processing';
                    image.statusText = '上传中...';
                });
                
                try {
                    // 创建FormData对象
                    const formData = new FormData();
                    
                    // 添加所有图片到FormData
                    this.vehicleLicenseImages.forEach(image => {
                        formData.append('vehicle_files', image.file, image.name);
                    });
                    
                    // 发送请求
                    const response = await fetch('/process-documents', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`上传失败: ${response.status} ${errorText}`);
                    }
                    
                    const result = await response.json();
                    
                    // 更新所有图片状态为成功
                    this.vehicleLicenseImages.forEach(image => {
                        image.status = 'success';
                        image.statusText = '识别成功';
                    });
                    
                    // 更新行驶证信息
                    if (result.vehicle) {
                        Object.assign(this.licenseInfo, {
                            plateNumber: result.vehicle.plate_number?.join('、') || this.licenseInfo.plateNumber,
                            vehicleType: result.vehicle.vehicle_type?.join('、') || this.licenseInfo.vehicleType,
                            vehicleSize: result.vehicle.dimensions?.join('、') || this.licenseInfo.vehicleSize,
                            vinCode: result.vehicle.vin_code?.join('、') || this.licenseInfo.vinCode,
                            engineNumber: result.vehicle.engine_number || this.licenseInfo.engineNumber,
                            energyType: result.vehicle.energy_type || this.licenseInfo.energyType
                        });
                    }
                    
                    this.showToastMessage(`成功上传并识别 ${this.vehicleLicenseImages.length} 张行驶证图片`);
                } catch (error) {
                    console.error('上传行驶证失败:', error);
                    
                    // 更新所有图片状态为失败
                    this.vehicleLicenseImages.forEach(image => {
                        image.status = 'error';
                        image.statusText = '上传失败';
                    });
                    
                    this.showToastMessage('上传行驶证失败: ' + error.message, 'error');
                }
            },

            // 删除图片（为预览列表添加删除功能）
            deleteImage(imageType, index) {
                if (imageType === 'driver') {
                    this.driverLicenseImages.splice(index, 1);
                } else if (imageType === 'vehicle') {
                    this.vehicleLicenseImages.splice(index, 1);
                }
            },

            // 重试上传单张图片
            async retryUploadImage(image) {
                const loading = this.showLoading('重新上传中...');
                
                try {
                    image.status = 'processing';
                    image.statusText = '上传中...';
                    
                    const formData = new FormData();
                    formData.append(image.type === 'driver' ? 'driver_files' : 'vehicle_files', image.file, image.name);
                    
                    const response = await fetch('/process-documents', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`重新上传失败: ${response.status} ${errorText}`);
                    }
                    
                    const result = await response.json();
                    
                    image.status = 'success';
                    image.statusText = '识别成功';
                    
                    // 更新相应信息
                    if (image.type === 'driver' && result.driver) {
                        Object.assign(this.licenseInfo, {
                            driverName: result.driver.name || this.licenseInfo.driverName,
                            idNumber: result.driver.license_number || this.licenseInfo.idNumber,
                            isValid: result.driver.is_valid ? '有效' : '无效'
                        });
                    } else if (image.type === 'vehicle' && result.vehicle) {
                        Object.assign(this.licenseInfo, {
                            plateNumber: result.vehicle.plate_number?.join('、') || this.licenseInfo.plateNumber,
                            vehicleType: result.vehicle.vehicle_type?.join('、') || this.licenseInfo.vehicleType,
                            vehicleSize: result.vehicle.dimensions?.join('、') || this.licenseInfo.vehicleSize,
                            vinCode: result.vehicle.vin_code?.join('、') || this.licenseInfo.vinCode,
                            engineNumber: result.vehicle.engine_number || this.licenseInfo.engineNumber,
                            energyType: result.vehicle.energy_type || this.licenseInfo.energyType
                        });
                    }
                    
                    this.showToastMessage('重新上传成功');
                } catch (error) {
                    console.error('重新上传失败:', error);
                    image.status = 'error';
                    image.statusText = '上传失败';
                    this.showToastMessage('重新上传失败: ' + error.message, 'error');
                } finally {
                    this.hideLoading(loading);
                }
            },

            // 重试识别
            async retryProcessImage(image) {
                if (image && image.file) {
                    image.status = 'uploading';
                    image.statusText = '上传中...';
                    await this.processImage(image.file, image.type);
                }
            },

            // 处理文本解析
            async processText() {
                if (!this.inputText.trim() || this.isProcessing) return;
                
                const loading = this.showLoading('解析中...');
                this.isProcessing = true;
                this.orderProgress = 0;
                this.orderProgressText = '正在解析...';
                
                try {
                    const response = await fetch('/process-text', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: this.inputText
                        })
                    });

                    if (!response.ok) throw new Error('解析失败');
                    
                    const result = await response.json();
                    
                    // 保存现有的不应被覆盖的字段
                    const currentProjectName = this.orderInfo.projectName;
                    const currentRemark = this.orderInfo.remark;
                    const currentArrivalTime = this.orderInfo.arrivalTime;
                    const currentPrice = this.orderInfo.price;
                    
                    this.orderInfo = {
                        weight: result.weight || '',
                        volume: result.volume || '',
                        location: result.location || '',
                        notes: result.notes || '',
                        price: currentPrice || '',
                        remark: currentRemark,
                        arrivalTime: currentArrivalTime,
                        projectName: currentProjectName
                    };
                    
                    this.orderProgress = 100;
                    this.orderProgressText = '解析完成';
                    this.showToastMessage('解析成功');
                } catch (error) {
                    console.error('解析失败:', error);
                    this.orderProgressText = '解析失败';
                    this.showToastMessage('解析失败', 'error');
                } finally {
                    this.isProcessing = false;
                    this.hideLoading(loading);
                }
            },

            // 添加触感反馈
            provideTactileFeedback() {
                // 检查设备是否支持振动API
                if (navigator.vibrate) {
                    navigator.vibrate(50); // 轻微振动50毫秒
                }
            },

            // 修改合并按钮的点击方法
            async mergeInfo() {
                this.provideTactileFeedback();
                if (!this.orderInfo.price) {
                    this.showToastMessage('请输入运价', 'error');
                    return;
                }
                if (!this.orderInfo.remark) {
                    this.showToastMessage('请输入运单备注', 'error');
                    return;
                }
                if (!this.licenseInfo.axleCount) {
                    this.showToastMessage('请选择车辆轴数', 'error');
                    return;
                }
                if (!this.licenseInfo.phoneNumber) {
                    this.showToastMessage('请输入司机手机号', 'error');
                    return;
                }
                
                this.mergedInfo = `          订单信息 
项目名称：${this.orderInfo.projectName || '无'}
客户地点：${this.orderInfo.location}
货物重量：${this.orderInfo.weight}
货物方量：${this.orderInfo.volume}
运价：${this.orderInfo.price}
到厂时间：${this.formattedArrivalTime}
运单备注：${this.orderInfo.remark}


          证件信息 
车牌号：${this.licenseInfo.plateNumber}
车辆类型：${this.licenseInfo.vehicleSize}${this.licenseInfo.vehicleType}
能源类型：${this.licenseInfo.energyType}
车辆轴数：${this.licenseInfo.axleCount}
司机姓名：${this.licenseInfo.driverName}
司机手机号：${this.licenseInfo.phoneNumber}
证件状态：${this.licenseInfo.isValid}
`;
            
                try {
                    await navigator.clipboard.writeText(this.mergedInfo);
                    this.showToastMessage('信息已合并并复制到剪贴板');
                } catch (err) {
                    const textarea = document.createElement('textarea');
                    textarea.value = this.mergedInfo;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    this.showToastMessage('信息已合并并复制到剪贴板');
                }
            },

            // 修改清除按钮的点击方法
            async clearAll() {
                this.provideTactileFeedback();
                // 确认对话框
                if (await this.showConfirm('确认清除', '是否确认清除所有已填写的信息？')) {
                    try {
                        await this.showConfirm('确认清除', '是否确认清除所有已填写的信息？');
                        
                        const now = new Date();
                        
                        this.inputText = '';
                        this.driverLicenseImages = [];
                        this.vehicleLicenseImages = [];
                        this.orderProgress = 0;
                        this.orderProgressText = '';
                        
                        this.arrivalTimeData = {
                            year: now.getFullYear(),
                            month: now.getMonth() + 1,
                            day: now.getDate(),
                            hour: now.getHours()
                        };
                        
                        this.orderInfo = {
                            weight: '',
                            volume: '',
                            location: '',
                            notes: '',
                            price: '',
                            remark: '',
                            arrivalTime: this.formattedArrivalTime,
                            projectName: ''
                        };
                        
                        this.licenseInfo = {
                            driverName: '',
                            idNumber: '',
                            isValid: '',
                            plateNumber: '',
                            vehicleType: '',
                            vehicleSize: '',
                            axleCount: '',
                            phoneNumber: '',
                            vinCode: '',
                            engineNumber: '',
                            energyType: ''
                        };
                        
                        this.mergedInfo = '';
                        
                        this.showToastMessage('已清除所有信息');
                    } catch (err) {
                        // 用户取消清除操作
                    }
                }
            },

            // 处理下拉刷新
            handleTouchStart(e) {
                if (document.documentElement.scrollTop === 0) {
                    this.isPulling = true;
                    this.pullRefreshDistance = 0;
                    this.startY = e.touches[0].pageY;
                }
            },

            handleTouchMove(e) {
                if (!this.isPulling) return;
                
                const moveY = e.touches[0].pageY;
                this.pullRefreshDistance = Math.min(Math.max(0, moveY - this.startY), 100);
                
                if (this.pullRefreshDistance > 0) {
                    e.preventDefault();
                    document.querySelector('.pull-refresh-tip').style.transform = 
                        `translateY(${this.pullRefreshDistance - 50}px)`;
                }
            },

            handleTouchEnd() {
                if (!this.isPulling) return;
                
                this.isPulling = false;
                if (this.pullRefreshDistance > 50) {
                    this.clearAll();
                }
                
                document.querySelector('.pull-refresh-tip').style.transform = 'translateY(-100%)';
                this.pullRefreshDistance = 0;
            },

            // 打开VIN码查询
            async openVinCodeQuery() {
                if (!this.licenseInfo.vinCode) {
                    this.showToastMessage('请先输入车辆识别代码', 'error');
                    return;
                }

                try {
                    // 复制VIN码到剪贴板
                    await navigator.clipboard.writeText(this.licenseInfo.vinCode);
                    this.showToastMessage('VIN码已复制到剪贴板');
                    
                    // 打开查询页面
                    window.open('https://info.vecc.org.cn/ve/index', '_blank');
                } catch (err) {
                    // 如果剪贴板API不可用，使用传统方法
                    const textarea = document.createElement('textarea');
                    textarea.value = this.licenseInfo.vinCode;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    this.showToastMessage('VIN码已复制到剪贴板');
                    window.open('https://info.vecc.org.cn/ve/index', '_blank');
                }
            }
        },
        mounted() {
            // 添加下拉刷新事件监听
            document.addEventListener('touchstart', this.handleTouchStart);
            document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd);
        },
        beforeDestroy() {
            // 移除事件监听
            document.removeEventListener('touchstart', this.handleTouchStart);
            document.removeEventListener('touchmove', this.handleTouchMove);
            document.removeEventListener('touchend', this.handleTouchEnd);
        }
    });
});