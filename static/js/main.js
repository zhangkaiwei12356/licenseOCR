// 定义 Vue 组件
const main = {
  data() {
    // 创建当前日期对象
    const now = new Date();
    const currentYear = now.getFullYear();
    
    return {
      inputText: '',
      driverLicenseImages: [], // 驾驶证图片
      vehicleLicenseImages: [], // 行驶证图片
      orderProgress: 0,
      orderProgressText: '',
      parseStatus: {
        driving: false,
        vehicle: false
      },
      orderInfo: {
        weight: '',
        volume: '',  // 新增方量字段
        location: '',
        notes: '',
        price: '',
        remark: '',
        arrivalTime: '',
        projectName: ''  // 新增项目名称字段
      },
      // 添加到厂时间选择器数据
      arrivalTimeData: {
        year: currentYear, // 默认当前年份
        month: now.getMonth() + 1, // 默认当前月份
        day: now.getDate(), // 默认当前日期
        hour: now.getHours() // 默认当前小时
      },
      arrivalTimeYears: [currentYear - 1, currentYear, currentYear + 1], // 年份选项
      validStatus: ['有效', '无效'],
      axleOptions: ['2轴', '3轴', '4轴', '5轴', '6轴'],
      energyTypes: ['汽油', '柴油', '天然气', '氢气', '电','新能源/电', '其他'],
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
      isProcessing: false
    }
  },
  computed: {
    // 格式化到厂时间
    formattedArrivalTime() {
      const { year, month, day, hour } = this.arrivalTimeData;
      if (year && month && day && hour !== undefined) {
        return `${year}年-${month}月-${day}日-${hour}点`;
      }
      return '';
    },
    mergedInfo() {
      return `          订单信息 
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
证件状态：${this.licenseInfo.isValid}`;
    },
    canParse() {
      return (this.driverLicenseImages.length > 0 && 
             this.driverLicenseImages.every(img => img.status === 'success')) || 
             (this.vehicleLicenseImages.length > 0 && 
             this.vehicleLicenseImages.every(img => img.status === 'success'));
    }
  },
  methods: {
    // 添加自定义提示框方法
    showToast(message, type = 'success') {
      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.top = '20px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.backgroundColor = type === 'success' ? '#67c23a' : '#f56c6c';
      toast.style.color = 'white';
      toast.style.padding = '10px 20px';
      toast.style.borderRadius = '4px';
      toast.style.zIndex = '9999';
      toast.textContent = message;
      document.body.appendChild(toast);
      
      // 3秒后自动移除
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 3000);
    },

    // 选择驾驶证图片
    chooseDriverLicenseImages() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/jpg,image/png';  // 明确指定文件类型
      input.multiple = true;  // 允许选择多张图片，修改为true
      
      input.onchange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          // 如果要上传的图片超过限制数量，只取前面的图片
          const filesToProcess = files.slice(0, 1 - this.driverLicenseImages.length);
          
          // 处理每张图片
          filesToProcess.forEach(file => {
            // 检查文件类型
            if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
              this.showToast(`不支持的文件类型: ${file.type}`, 'error');
              return;
            }
            
            // 检查文件大小
            if (file.size > 16 * 1024 * 1024) { // 16MB
              this.showToast(`文件过大: ${file.name}`, 'error');
              return;
            }
            
            console.log(`处理驾驶证文件: ${file.name}, 类型: ${file.type}, 大小: ${file.size} 字节`);
            const url = URL.createObjectURL(file);
            
            // 添加图片到预览列表
            this.driverLicenseImages.push({
              url: url,
            status: 'uploading',
              statusText: '上传中...',
              file: file,
              type: 'driver' // 标记为驾驶证
          });

          // 开始处理图片
            this.processImage(file, 'driver');
          });
        }
      };
      
      input.click();
    },

    // 选择行驶证图片
    chooseVehicleLicenseImages() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/jpg,image/png';  // 明确指定文件类型
      input.multiple = true;  // 允许选择多张图片
      
      input.onchange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          // 如果要上传的图片超过限制数量，只取前面的图片
          const filesToProcess = files.slice(0, 2 - this.vehicleLicenseImages.length);
          
          // 处理每张图片
          filesToProcess.forEach(file => {
            // 检查文件类型
            if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
              this.showToast(`不支持的文件类型: ${file.type}`, 'error');
              return;
            }
            
            // 检查文件大小
            if (file.size > 16 * 1024 * 1024) { // 16MB
              this.showToast(`文件过大: ${file.name}`, 'error');
              return;
            }
            
            console.log(`处理行驶证文件: ${file.name}, 类型: ${file.type}, 大小: ${file.size} 字节`);
            const url = URL.createObjectURL(file);
            
            // 添加图片到预览列表
            this.vehicleLicenseImages.push({
              url: url,
              status: 'uploading',
              statusText: '上传中...',
              file: file,
              type: 'vehicle' // 标记为行驶证
            });

            // 开始处理图片
            this.processImage(file, 'vehicle');
          });
        }
      };
      
      input.click();
    },

    // 更新证件状态
    updateValidityStatus() {
      const validityText = this.licenseInfo.validityPeriod;
      if (!validityText) {
        this.$set(this.licenseInfo, 'isValid', '');
        return;
      }

      // 处理"至长期"的情况
      if (validityText.includes('至长期')) {
        this.$set(this.licenseInfo, 'isValid', '有效');
        return;
      }

      // 提取日期部分
      const dates = validityText.match(/\d{4}[-年]\d{1,2}[-月]\d{1,2}/g);
      if (!dates || dates.length !== 2) {
        this.$set(this.licenseInfo, 'isValid', '无效');
        return;
      }

      // 转换日期格式
      const startDate = new Date(dates[0].replace(/[年月]/g, '-'));
      const endDate = new Date(dates[1].replace(/[年月]/g, '-'));
      const currentDate = new Date();

      // 判断是否在有效期内
      this.$set(this.licenseInfo, 'isValid', 
        startDate <= currentDate && currentDate <= endDate ? '有效' : '无效'
      );
    },

    // 更新有效期状态
    updateValidityPeriod() {
      // 当有效期状态改变时，同步更新证件状态
      this.$set(this.licenseInfo, 'isValid', this.licenseInfo.isValid);
    },

    // 处理图片上传和识别
    async processImage(file, licenseType) {
      try {
        let image;
        if (licenseType === 'driver') {
          image = this.driverLicenseImages.find(img => img.file === file);
        } else {
          image = this.vehicleLicenseImages.find(img => img.file === file);
        }
        
        if (image) {
          image.status = 'processing';
          image.statusText = '识别中...';
        }

        // 创建 FormData 对象
        const formData = new FormData();
        formData.append('files', file);
        formData.append('licenseType', licenseType); // 添加证件类型参数

        // 调用后端接口
        const response = await fetch('http://localhost:5000/process-documents', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          console.log('后端返回结果:', result);
          
          // 更新状态为成功
          if (image) {
            image.status = 'success';
            image.statusText = '识别成功';
          }

          // 更新证件信息 - 驾驶证信息合并而不是覆盖
          if (licenseType === 'driver' && result.driver) {
            console.log('处理司机信息:', result.driver);
            // 只在字段为空时更新
            if (!this.licenseInfo.driverName && result.driver.name) {
              this.$set(this.licenseInfo, 'driverName', result.driver.name);
            }
            if (!this.licenseInfo.idNumber && result.driver.license_number) {
              this.$set(this.licenseInfo, 'idNumber', result.driver.license_number);
            }
            // 对于证件状态，只有当前状态不是有效时，才接受新的有效状态
            if (this.licenseInfo.isValid !== '有效' && result.driver.is_valid) {
              this.$set(this.licenseInfo, 'isValid', '有效');
            } else if (!this.licenseInfo.isValid) {
              this.$set(this.licenseInfo, 'isValid', result.driver.is_valid ? '有效' : '无效');
            }
          }
          
          if (licenseType === 'vehicle' && result.vehicle) {
            console.log('更新行驶证信息:', result.vehicle);  // 添加调试日志
            
            // 处理车牌号（列表）
            if (result.vehicle.plate_number && result.vehicle.plate_number.length > 0) {
              // 获取当前车牌列表
              const currentPlates = this.licenseInfo.plateNumber ? this.licenseInfo.plateNumber.split('、') : [];
              // 合并新识别的车牌和现有车牌
              const allPlates = [...currentPlates, ...result.vehicle.plate_number];
              // 去重
              const uniquePlates = [...new Set(allPlates)].filter(plate => plate.trim() !== '');
              this.$set(this.licenseInfo, 'plateNumber', uniquePlates.join('、'));
            }
            
            // 处理车辆类型
            if (result.vehicle.vehicle_type && result.vehicle.vehicle_type.length > 0) {
              // 获取当前车辆类型列表
              const currentTypes = this.licenseInfo.vehicleType ? this.licenseInfo.vehicleType.split('、') : [];
              // 合并新识别的车辆类型和现有类型
              const allTypes = [...currentTypes, ...result.vehicle.vehicle_type];
              // 去重
              const uniqueTypes = [...new Set(allTypes)].filter(type => type.trim() !== '');
              this.$set(this.licenseInfo, 'vehicleType', uniqueTypes.join('、'));
            }
            
            // 处理车辆尺寸
            if (result.vehicle.dimensions && result.vehicle.dimensions.length > 0) {
              // 获取当前尺寸列表
              const currentDims = this.licenseInfo.vehicleSize ? this.licenseInfo.vehicleSize.split('、') : [];
              // 合并新识别的尺寸和现有尺寸
              const allDims = [...currentDims, ...result.vehicle.dimensions];
              // 去重
              const uniqueDims = [...new Set(allDims)].filter(dim => dim.trim() !== '');
              this.$set(this.licenseInfo, 'vehicleSize', uniqueDims.join('、'));
            }
            
            // 处理车辆识别代码（列表）
            if (result.vehicle.vin_code && result.vehicle.vin_code.length > 0) {
              // 获取当前VIN码列表
              const currentVins = this.licenseInfo.vinCode ? this.licenseInfo.vinCode.split('、') : [];
              // 合并新识别的VIN码和现有VIN码
              const allVins = [...currentVins, ...result.vehicle.vin_code];
              // 去重
              const uniqueVins = [...new Set(allVins)].filter(vin => vin.trim() !== '');
              this.$set(this.licenseInfo, 'vinCode', uniqueVins.join('、'));
            }
            
            // 处理发动机号（单一字符串）
            if (!this.licenseInfo.engineNumber && result.vehicle.engine_number) {
              this.licenseInfo.engineNumber = result.vehicle.engine_number;
            }
            
            // 处理能源类型
            if (!this.licenseInfo.energyType && result.vehicle.energy_type) {
              this.$set(this.licenseInfo, 'energyType', result.vehicle.energy_type);
            }
          }

          // 如果所有图片都已处理完成，显示提示
          const driverCompleted = this.driverLicenseImages.every(img => img.status === 'success' || img.status === 'error');
          const vehicleCompleted = this.vehicleLicenseImages.every(img => img.status === 'success' || img.status === 'error');
          
          if (driverCompleted && vehicleCompleted && 
              (this.driverLicenseImages.length > 0 || this.vehicleLicenseImages.length > 0)) {
            this.showToast('所有证件识别完成');
          }
        } else {
          throw new Error('接口请求失败');
        }
      } catch (error) {
        console.error('处理图片失败:', error);
        let image;
        if (licenseType === 'driver') {
          image = this.driverLicenseImages.find(img => img.file === file);
        } else {
          image = this.vehicleLicenseImages.find(img => img.file === file);
        }
        
        if (image) {
          image.status = 'error';
          image.statusText = '识别失败';
        }
        this.showToast('识别失败', 'error');
      }
    },

    // 处理文本解析进度
    async processText() {
      if (!this.inputText || this.isProcessing) return;
      
      this.isProcessing = true;
      this.orderProgress = 10;
      
      // 保存不应被覆盖的字段
      const currentProjectName = this.orderInfo.projectName;
      const currentRemark = this.orderInfo.remark;
      const currentArrivalTime = this.orderInfo.arrivalTime;
      const currentPrice = this.orderInfo.price;
      
      try {
        console.log('开始处理文本:', this.inputText.substring(0, 100) + '...');
        
        const response = await fetch('http://localhost:5000/process-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: this.inputText
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('后端返回结果:', result);
          
          this.orderInfo = {
            weight: result.weight || '',
            volume: result.volume || '',  // 新增方量处理
            location: result.location || '',
            notes: result.notes || '',
            price: currentPrice || '',
            remark: currentRemark || '',
            arrivalTime: currentArrivalTime || '',
            projectName: currentProjectName || ''  // 保留项目名称
          };
          
          // 如果返回中包含车辆类型和尺寸信息，更新到licenseInfo
          if (result.vehicle_type && Array.isArray(result.vehicle_type)) {
            this.$set(this.licenseInfo, 'vehicleType', result.vehicle_type.join('、'));
            console.log('更新车辆类型:', this.licenseInfo.vehicleType);
          }
          
          if (result.dimensions && Array.isArray(result.dimensions)) {
            this.$set(this.licenseInfo, 'vehicleSize', result.dimensions.join('、'));
            console.log('更新车辆尺寸:', this.licenseInfo.vehicleSize);
          }
          
          console.log('更新后的订单信息:', this.orderInfo);
          console.log('更新后的车辆信息:', {
            vehicleType: this.licenseInfo.vehicleType,
            vehicleSize: this.licenseInfo.vehicleSize
          });
          
          this.orderProgress = 100;
          this.orderProgressText = '解析完成';
          
          this.showToast('解析成功');
        } else {
          const errorData = await response.json();
          console.error('后端返回错误:', errorData);
          throw new Error('解析失败: ' + (errorData.error || '未知错误'));
        }
      } catch (error) {
        console.error('解析失败:', error);
        this.orderProgressText = '解析失败';
        this.showToast('解析失败: ' + error.message, 'error');
      } finally {
        this.isProcessing = false;
      }
    },

    // 解析证件
    async parseLicenses() {
      if (this.driverLicenseImages.length === 0 && this.vehicleLicenseImages.length === 0) {
        alert('请至少上传一张驾驶证或行驶证');
        return;
      }

      // 显示加载提示
      const loadingDiv = document.createElement('div');
      loadingDiv.style.position = 'fixed';
      loadingDiv.style.top = '50%';
      loadingDiv.style.left = '50%';
      loadingDiv.style.transform = 'translate(-50%, -50%)';
      loadingDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      loadingDiv.style.color = 'white';
      loadingDiv.style.padding = '20px';
      loadingDiv.style.borderRadius = '5px';
      loadingDiv.textContent = '正在解析证件...';
      document.body.appendChild(loadingDiv);

      try {
        // 创建FormData对象
        const formData = new FormData();
        
        // 添加所有驾驶证图片
        for (const image of this.driverLicenseImages) {
          formData.append('driver_files', image.file);
        }
        
        // 添加所有行驶证图片
        for (const image of this.vehicleLicenseImages) {
          formData.append('vehicle_files', image.file);
        }

        // 调用后端API
        const response = await fetch('http://localhost:5000/process-documents', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          console.log('解析证件返回结果:', result);  // 添加调试日志
          
          // 更新驾驶证信息
          if (result.driver) {
            console.log('更新驾驶证信息:', result.driver);  // 添加调试日志
            this.licenseInfo.driverName = result.driver.name || this.licenseInfo.driverName;
            this.licenseInfo.idNumber = result.driver.license_number || this.licenseInfo.idNumber;
            this.licenseInfo.isValid = result.driver.is_valid ? '有效' : '无效';
            console.log('更新后的驾驶证信息:', {  // 添加调试日志
              driverName: this.licenseInfo.driverName,
              idNumber: this.licenseInfo.idNumber,
              isValid: this.licenseInfo.isValid
            });
          }
          
          // 更新行驶证信息
          if (result.vehicle) {
            console.log('更新行驶证信息:', result.vehicle);  // 添加调试日志
            
            // 处理车牌号（列表）
            if (result.vehicle.plate_number && result.vehicle.plate_number.length > 0) {
              this.licenseInfo.plateNumber = result.vehicle.plate_number.join('、');
            } else {
              this.licenseInfo.plateNumber = this.licenseInfo.plateNumber || '';
            }
            
            // 处理车辆类型
            if (result.vehicle.vehicle_type && result.vehicle.vehicle_type.length > 0) {
              // 获取当前车辆类型列表
              const currentTypes = this.licenseInfo.vehicleType ? this.licenseInfo.vehicleType.split('、') : [];
              // 合并新识别的车辆类型和现有类型
              const allTypes = [...currentTypes, ...result.vehicle.vehicle_type];
              // 去重
              const uniqueTypes = [...new Set(allTypes)].filter(type => type.trim() !== '');
              this.$set(this.licenseInfo, 'vehicleType', uniqueTypes.join('、'));
            }
            
            // 处理车辆尺寸
            if (result.vehicle.dimensions && result.vehicle.dimensions.length > 0) {
              // 获取当前尺寸列表
              const currentDims = this.licenseInfo.vehicleSize ? this.licenseInfo.vehicleSize.split('、') : [];
              // 合并新识别的尺寸和现有尺寸
              const allDims = [...currentDims, ...result.vehicle.dimensions];
              // 去重
              const uniqueDims = [...new Set(allDims)].filter(dim => dim.trim() !== '');
              this.$set(this.licenseInfo, 'vehicleSize', uniqueDims.join('、'));
            }
            
            // 处理车辆识别代码（列表）
            if (result.vehicle.vin_code && result.vehicle.vin_code.length > 0) {
              this.licenseInfo.vinCode = result.vehicle.vin_code.join('、');
            } else {
              this.licenseInfo.vinCode = this.licenseInfo.vinCode || '';
            }
            
            // 处理发动机号（单一字符串）
            this.licenseInfo.engineNumber = result.vehicle.engine_number || this.licenseInfo.engineNumber || '';
            
            // 处理能源类型
            this.licenseInfo.energyType = result.vehicle.energy_type || this.licenseInfo.energyType;
            
            console.log('更新后的行驶证信息:', {  // 添加调试日志
              plateNumber: this.licenseInfo.plateNumber,
              vehicleType: this.licenseInfo.vehicleType,
              vehicleSize: this.licenseInfo.vehicleSize,
              vinCode: this.licenseInfo.vinCode,
              engineNumber: this.licenseInfo.engineNumber,
              energyType: this.licenseInfo.energyType
            });
          }

          document.body.removeChild(loadingDiv);
          alert('解析完成');
        } else {
          throw new Error('解析失败');
        }
      } catch (error) {
        console.error('解析证件失败:', error);
        document.body.removeChild(loadingDiv);
        alert('解析失败');
      }
    },

    // 合并信息
    mergeInfo() {
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
证件状态：${this.licenseInfo.isValid}`;
    },
    
    // 处理证件状态选择
    handleValidStatusChange(e) {
      this.licenseInfo.isValid = this.validStatus[e.detail.value];
    },
    
    // 处理轴数选择
    handleAxleCountChange(e) {
      this.licenseInfo.axleCount = this.axleOptions[e.detail.value];
    },

    // 清除所有信息
    async clearAll() {
      try {
        await this.showConfirm('确认清除', '是否确认清除所有已填写的信息？');
        
        const now = new Date();
        
        // 重置到厂时间为当前时间
        this.arrivalTimeData = {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          hour: now.getHours()
        };
        
        // 重置orderInfo
        this.orderInfo = {
          weight: '',
          volume: '',  // 清除方量
          location: '',
          notes: '',
          price: '',
          remark: '',
          arrivalTime: this.formattedArrivalTime,
          projectName: ''  // 清除项目名称
        };
        
        // 清除图片
        this.driverLicenseImages = [];
        this.vehicleLicenseImages = [];
        
        // 清除证件信息
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
        
        // 清除合并信息
        this.mergedInfo = '';
        
        // 清除进度
        this.orderProgress = 0;
        this.orderProgressText = '';
        
        // 清除解析状态
        this.parseStatus = {
          driving: false,
          vehicle: false
        };
        
        this.showToast('已清除所有信息');
      } catch (err) {
        // 用户取消清除操作
      }
    },

    copyVinCodeAndRedirect() {
        // 复制车辆识别代码到剪贴板
        navigator.clipboard.writeText(this.licenseInfo.vinCode).then(() => {
            this.showToast('车辆识别代码已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
            this.showToast('复制失败', 'error');
        });

        // 跳转到指定网页（可配置）
        window.open('https://info.vecc.org.cn/ve/index', '_blank'); // 替换为实际的URL
    },

    // 添加重新识别功能
    retryProcessImage(image) {
      if (image && image.file) {
        // 更新状态为上传中
        image.status = 'uploading';
        image.statusText = '上传中...';
        
        // 重新处理图片
        this.processImage(image.file, image.type);
      }
    }
  },
  watch: {
    // 监听到厂时间数据变化，自动更新arrivalTime字段
    arrivalTimeData: {
      handler(newVal) {
        this.orderInfo.arrivalTime = this.formattedArrivalTime;
      },
      deep: true,
      immediate: true
    }
  }
}

// 确保 main 对象被正确导出
window.main = main;

// 创建 Vue 实例
new Vue({
  el: '#app',
  ...main
});