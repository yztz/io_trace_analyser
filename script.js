document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusMessage = document.getElementById('status-message');

    const rwCountChartDiv = document.getElementById('rw-count-chart');
    const offsetTimeChartDiv = document.getElementById('offset-time-chart');
    const offsetHistogramReadChartDiv = document.getElementById('offset-histogram-read-chart');
    const offsetHistogramWriteChartDiv = document.getElementById('offset-histogram-write-chart');
    const p99InfoDiv = document.getElementById('p99-info');

    let rwCountChart, offsetTimeChart;
    let offsetHistogramReadChart, offsetHistogramWriteChart;

    function formatLBA(lba, sectorSize = 512, precision = 1) {
        if (lba === undefined || isNaN(lba)) return 'N/A';
        const bytes = lba * sectorSize;
        const KILOBYTE = 1024;
        const MEGABYTE = KILOBYTE * 1024;
        const GIGABYTE = MEGABYTE * 1024;
        const TERABYTE = GIGABYTE * 1024;

        if (bytes === 0) return `0.0 MB`; // 对于0，显示0.0 MB

        if (Math.abs(bytes) >= TERABYTE) {
            return (bytes / TERABYTE).toFixed(precision) + ' TB';
        }
        if (Math.abs(bytes) >= GIGABYTE) {
            return (bytes / GIGABYTE).toFixed(precision) + ' GB';
        }

        return (bytes / MEGABYTE).toFixed(precision) + ' MB';
    }

    function updatePageTitle(fileName) {
        if (fileName) {
            document.title = `IO Trace Analyzer - ${fileName}`;
        } else {
            document.title = 'IO Trace Analyzer';
        }
    }

    function initCharts() {
        if (rwCountChart) rwCountChart.dispose();
        if (offsetTimeChart) offsetTimeChart.dispose();
        if (offsetHistogramReadChart) offsetHistogramReadChart.dispose();
        if (offsetHistogramWriteChart) offsetHistogramWriteChart.dispose();

        rwCountChart = echarts.init(rwCountChartDiv);
        offsetTimeChart = echarts.init(offsetTimeChartDiv);
        offsetHistogramReadChart = echarts.init(offsetHistogramReadChartDiv);
        offsetHistogramWriteChart = echarts.init(offsetHistogramWriteChartDiv);
        p99InfoDiv.innerHTML = '';
    }

    async function handleReceivedTraceData(arrayBuffer, fileName = 'received_trace.trace') {
         statusMessage.textContent = `正在处理通过 postMessage 接收的文件: ${fileName}...`;
         statusMessage.style.color = 'inherit';

         try {
            // 将 ArrayBuffer 转换为文本
            const textDecoder = new TextDecoder('utf-8'); // 假设文件是UTF-8编码
            const content = textDecoder.decode(arrayBuffer);

            const traceData = parseTraceFile(content);
            if (traceData.length === 0) {
                statusMessage.textContent = '接收到的文件中未找到有效的 trace 数据，或数据在 #0x... 后被重置为空。';
                statusMessage.style.color = 'orange';
                initCharts();
                updatePageTitle();
                return;
            }
            statusMessage.textContent = `通过 postMessage 接收文件处理完毕，共 ${traceData.length} 条记录。`;
            analyzeAndPlotData(traceData);
            updatePageTitle(fileName);
         } catch (error) {
            console.error("处理接收到的文件时出错:", error);
            statusMessage.textContent = `处理接收到的文件时出错: ${error.message}`;
            statusMessage.style.color = 'red';
            initCharts();
            updatePageTitle();
         }
    }

    // --- 新增: 监听 postMessage 事件 ---
    window.addEventListener('message', async (event) => {
        // *** 安全检查: 仅处理来自信任源的消息 ***
        // 将 'http://localhost:8000' 替换为你的服务器实际的源
        // const ALLOWED_ORIGINS = ['http://localhost:8000'];
        // if (!ALLOWED_ORIGINS.includes(event.origin)) {
        //     console.warn(`Analyser: Received message from untrusted origin: ${event.origin}. Ignoring.`);
        //     return;
        // }

        console.log(`Analyser: Received message from trusted origin: ${event.origin}`, event.data);

        // 处理 PING/PONG 握手 (可选, 如果发送方使用)
        if (event.data === 'PING' && event.source) {
            console.log('Analyser: Received PING, sending PONG.');
            event.source.postMessage('PONG', event.origin);
            return; // PING消息处理完毕
        }

        // 检查消息是否包含我们期望的 trace 数据结构
        // 假设发送方发送的数据格式为 { ioTrace: { buffer: ArrayBuffer, fileName: string } }
        if (event.data && event.data.ioTrace && event.data.ioTrace.buffer instanceof ArrayBuffer) {
             console.log('Analyser: Received valid trace data.');
             const traceBuffer = event.data.ioTrace.buffer;
             const traceFileName = event.data.ioTrace.fileName || 'received_trace.trace'; // 使用文件名或默认名
             handleReceivedTraceData(traceBuffer, traceFileName); // 调用处理函数
        } else {
             console.warn('Analyser: Received message with unexpected data format.', event.data);
        }
    });
    // --- 新增结束 ---


    // ... (dropZone and fileInput event listeners remain the same) ...
    // 现有的 handleFile 函数用于处理文件输入和拖拽
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.style.backgroundColor = '#d4eaff';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.backgroundColor = '#e9f5ff';
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.style.backgroundColor = '#e9f5ff';
        const files = event.dataTransfer.files;
        if (files.length) {
            handleFile(files[0]); // 调用现有的 handleFile 处理拖拽文件
        }
    });

    fileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length) {
            handleFile(files[0]); // 调用现有的 handleFile 处理文件输入
        }
    });

    function handleFile(file) {
        if (!file.name.endsWith('.trace')) {
            statusMessage.textContent = '错误：请上传 .trace 文件。';
            statusMessage.style.color = 'red';
            return;
        }
        statusMessage.textContent = `正在处理文件: ${file.name}...`;
        statusMessage.style.color = 'inherit';

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result; // FileReader 读作文本
                const traceData = parseTraceFile(content);
                if (traceData.length === 0) {
                    statusMessage.textContent = '文件中未找到有效的 trace 数据，或数据在 #0x... 后被重置为空。';
                    statusMessage.style.color = 'orange';
                    initCharts();
                    updatePageTitle();
                    return;
                }
                statusMessage.textContent = `文件处理完毕，共 ${traceData.length} 条记录。`;
                analyzeAndPlotData(traceData);
                updatePageTitle(file.name);
            } catch (error) {
                console.error("处理文件时出错:", error);
                statusMessage.textContent = `处理文件时出错: ${error.message}`;
                statusMessage.style.color = 'red';
                initCharts();
                updatePageTitle();
            }
        };
        reader.onerror = () => {
            statusMessage.textContent = '读取文件失败。';
            statusMessage.style.color = 'red';
            initCharts();
            updatePageTitle();
        };
        reader.readAsText(file);
    }

    // parseTraceFile 函数保持不变，它处理文本内容
    function parseTraceFile(content) {
        let lines = content.split('\n');
        let traceEntries = [];
        let resetOccurred = false;
        let lastResetLineIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#0x')) {
                lastResetLineIndex = i;
                resetOccurred = true;
            }
        }

        const startIndex = resetOccurred ? lastResetLineIndex + 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '' || line.startsWith('#')) {
                continue;
            }

            const parts = line.split(/\s+/);
            if (parts.length >= 5) {
                const entry = {
                    time: parseInt(parts[0], 10),
                    deviceId: parseInt(parts[1], 10),
                    offset: parseInt(parts[2], 10),
                    size: parseInt(parts[3], 10),
                    rwFlag: parseInt(parts[4], 10)
                };
                if ([entry.time, entry.offset, entry.size, entry.rwFlag].some(isNaN)) {
                    console.warn(`Skipping invalid line (parsing error): ${line}`);
                    continue;
                }
                traceEntries.push(entry);
            } else {
                console.warn(`Skipping invalid line (not enough parts): ${line}`);
            }
        }
        return traceEntries;
    }

    // analyzeAndPlotData 函数保持不变，它处理解析后的数据数组
    function analyzeAndPlotData(data) {
        initCharts();

        let readCount = 0;
        let writeCount = 0;
        data.forEach(entry => {
            if (entry.rwFlag === 0) writeCount++;
            else if (entry.rwFlag === 1) readCount++;
        });

        rwCountChart.setOption({
            title: { text: '读写IO比例', left: 'center' },
            tooltip: { trigger: 'item', formatter: "{a} <br/>{b} : {c} ({d}%)" },
            legend: { top: 'bottom' },
            series: [{
                name: 'IO类型',
                type: 'pie',
                radius: '50%',
                data: [
                    { value: readCount, name: '读 (Read)' },
                    { value: writeCount, name: '写 (Write)' }
                ],
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }]
        });

        const calculateP99InterArrival = (opsType) => {
            const filteredOps = data.filter(d => d.rwFlag === opsType).sort((a, b) => a.time - b.time);
            if (filteredOps.length < 2) return 'N/A (数据不足)';

            const interArrivalTimes = [];
            for (let i = 1; i < filteredOps.length; i++) {
                interArrivalTimes.push(filteredOps[i].time - filteredOps[i-1].time);
            }
            if (interArrivalTimes.length === 0) return 'N/A (数据不足)';

            interArrivalTimes.sort((a, b) => a - b);
            const p99Index = Math.floor(0.99 * (interArrivalTimes.length - 1));
            return `${(interArrivalTimes[p99Index] / 1000).toFixed(3)} µs`;
        };

        const p99Read = calculateP99InterArrival(1);
        const p99Write = calculateP99InterArrival(0);

        p99InfoDiv.innerHTML = `
            <h3>统计摘要:</h3>
            <p><strong>总读取 (Read) 操作数:</strong> ${readCount}</p>
            <p><strong>总写入 (Write) 操作数:</strong> ${writeCount}</p>
            <p><strong>总 I/O 操作数:</strong> ${readCount + writeCount}</p>
            <hr style="margin: 15px 0;">
            <h3>P99 请求间隔时间:</h3>
            <p><strong>读请求 (Read):</strong> ${p99Read}</p>
            <p><strong>写请求 (Write):</strong> ${p99Write}</p>
            <p><small>注意: 这是请求之间的间隔时间，并非I/O延迟。</small></p>
        `;

        const scatterDataRead = data.filter(d => d.rwFlag === 1).map(d => [d.time, d.offset, d.size]);
        const scatterDataWrite = data.filter(d => d.rwFlag === 0).map(d => [d.time, d.offset, d.size]);

        offsetTimeChart.setOption({
            title: { text: 'Offset vs. 时间散点图', left: 'center' },
            tooltip: {
                trigger: 'item',
                formatter: params => {
                    const timeNs = params.value[0];
                    const offsetLBA = params.value[1];
                    const sizeSectors = params.value[2];
                    const type = params.seriesName;
                    return `类型: ${type}<br/>
                        时间: ${(timeNs / 1e6).toFixed(3)} ms<br/>
                        Offset: ${formatLBA(offsetLBA, 512, 2)} (LBA: ${offsetLBA})<br/>
                        大小: ${sizeSectors} sectors (${(sizeSectors * 512 / 1024).toFixed(2)} KB)`;
                }
            },
            legend: { data: ['读 (Read)', '写 (Write)'], top: '30px' }, // 调整legend位置，避免与slider重叠
            grid: { // 调整grid，为slider留出空间
                left: '5%', // 增加左边距，为Y轴slider留空间
                right: '8%', // 增加右边距，为Y轴slider留空间
                bottom: '15%', // 增加下边距，为X轴slider留空间
                containLabel: true
            },
            xAxis: {
                nameLocation: 'middle',
                nameGap: 26,    
                type: 'value',
                name: '时间 (ns)',
                axisLabel: { formatter: val => `${(val / 1e6).toFixed(0)}ms` }
            },
            yAxis: {
                type: 'value',
                name: 'Offset',
                axisLabel: { formatter: val => formatLBA(val, 512, 1) }
            },
            series: [
                {
                    name: '读 (Read)',
                    type: 'scatter',
                    symbolSize: 1, // 可以尝试减小到 2 或 1
                    data: scatterDataRead,
                    itemStyle: { color: '#3366CC' },
                    // >>> 添加大数据量优化配置 <<<
                    large: true,             // 开启大数据量优化
                    largeThreshold: 2000,    // 数据量大于 2000 时启用 large 模式 (根据实际数据量调整)
                    progressive: 5000,       // 开启渐进式渲染，每次渲染 5000 条数据 (根据实际情况调整)
                    progressiveThreshold: 5000 // 数据量大于 5000 时启用渐进式渲染 (根据实际情况调整)
                    // >>> end <<<
                },
                {
                    name: '写 (Write)',
                    type: 'scatter',
                    symbolSize: 1, // 可以尝试减小到 2 或 1
                    data: scatterDataWrite,
                    itemStyle: { color: '#DC3912' },
                    // >>> 添加大数据量优化配置 <<<
                    large: true,             // 开启大数据量优化
                    largeThreshold: 2000,    // 数据量大于 2000 时启用 large 模式 (根据实际数据量调整)
                    progressive: 5000,       // 开启渐进式渲染，每次渲染 5000 条数据 (根据实际情况调整)
                    progressiveThreshold: 5000 // 数据量大于 5000 时启用渐进式渲染 (根据实际情况调整)
                    // >>> end <<<
                }
            ],
            // 新增：DataZoom 配置，用于区域缩放
            dataZoom: [
                {
                    type: 'inside', // 内置型数据区域缩放组件（鼠标滚轮缩放、拖拽平移）
                    xAxisIndex: 0,  // 控制X轴
                    filterMode: 'empty' // 数据过滤模式，'empty'表示过滤掉范围外的数据
                },
                {
                    type: 'inside', // 内置型数据区域缩放组件
                    yAxisIndex: 0,  // 控制Y轴
                    filterMode: 'empty'
                },
                {
                    type: 'slider', // 滑动条型数据区域缩放组件
                    xAxisIndex: 0,  // 控制X轴
                    filterMode: 'empty',
                    height: 20,     // Slider高度
                    bottom: 10      // Slider离底部的距离
                },
                {
                    type: 'slider', // 滑动条型数据区域缩放组件
                    yAxisIndex: 0,  // 控制Y轴
                    filterMode: 'empty',
                    width: 20,      // Slider宽度
                    right: 10       // Slider离右边的距离
                }
            ]
        });

        const offsetCounts = {};
        let maxOffsetLBA = 0;
        data.forEach(entry => {
            if (entry.offset > maxOffsetLBA) maxOffsetLBA = entry.offset;
        });

        const maxOffsetMBValue = (maxOffsetLBA * 512) / (1024 * 1024);
        let binSizeLBA;
        if (maxOffsetLBA === 0) {
            binSizeLBA = 2048; // 1MB in LBA for 512B sectors
        } else if (maxOffsetMBValue < 100) {
             // 至少1MB per bin, max 50 bins
            binSizeLBA = Math.max(2048, Math.ceil(maxOffsetLBA / 50 / 2048) * 2048);
        } else if (maxOffsetMBValue < 1024) {
             // 128MB per bin
            binSizeLBA = (128 * 1024 * 1024) / 512;
        } else if (maxOffsetMBValue < 10240) {
             // 512MB per bin
            binSizeLBA = (512 * 1024 * 1024) / 512;
        } else {
             // 1GB per bin
            binSizeLBA = (1 * 1024 * 1024 * 1024) / 512;
        }

        data.forEach(entry => {
            const binStart = Math.floor(entry.offset / binSizeLBA) * binSizeLBA;
            if (!offsetCounts[binStart]) {
                offsetCounts[binStart] = { read: 0, write: 0 };
            }
            if (entry.rwFlag === 1) offsetCounts[binStart].read++;
            else offsetCounts[binStart].write++;
        });

        const histogramCategoriesLBA = Object.keys(offsetCounts).map(Number).sort((a, b) => a - b);
        const histogramReadData = histogramCategoriesLBA.map(cat => offsetCounts[cat].read);
        const histogramWriteData = histogramCategoriesLBA.map(cat => offsetCounts[cat].write);

        // X轴分类数据使用formatLBA格式化，精度为1
        const commonXAxisDataFormatted = histogramCategoriesLBA.map(lba => formatLBA(lba, 512, 1));

        // Read IO Offset Distribution
        offsetHistogramReadChart.setOption({
            title: { text: '读IO Offset分布', left: 'center' },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: params => {
                    const currentBinIndex = params[0].dataIndex;
                    const currentBinLBA = histogramCategoriesLBA[currentBinIndex]; // 获取原始LBA值
                    const binEndLBA = currentBinLBA + binSizeLBA - 1;
                    let res = `Offset Range: ${formatLBA(currentBinLBA, 512, 2)} - ${formatLBA(binEndLBA, 512, 2)}<br/>`;
                    res += `(LBA: ${currentBinLBA} - ${binEndLBA})<br/>`;
                    res += `${params[0].seriesName}: ${params[0].value}`;
                    return res;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '20%', containLabel: true },
            xAxis: {
                type: 'category',
                data: commonXAxisDataFormatted, // 使用格式化后的X轴数据
                name: 'Offset起始',
                nameLocation: 'middle',
                nameGap: 56,
                axisLabel: {
                    // interval: 0, // 强制显示所有标签
                     rotate: 45 // 旋转标签避免重叠
                }
            },
            yAxis: { type: 'value', name: '读IO数量' },
            series: [
                {
                    name: '读IO数量',
                    type: 'bar',
                    data: histogramReadData,
                    itemStyle: { color: '#3366CC' }
                }
            ],
             dataZoom: [ // 为柱状图添加 dataZoom
                {
                    type: 'inside',
                    xAxisIndex: 0,
                    filterMode: 'none'
                },
                {
                    type: 'slider',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    height: 20,
                    bottom: 10
                }
            ]
        });

        // Write IO Offset Distribution
        offsetHistogramWriteChart.setOption({
            title: { text: '写IO Offset分布', left: 'center' },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: params => {
                    const currentBinIndex = params[0].dataIndex;
                    const currentBinLBA = histogramCategoriesLBA[currentBinIndex]; // 获取原始LBA值
                    const binEndLBA = currentBinLBA + binSizeLBA - 1;
                    let res = `Offset Range: ${formatLBA(currentBinLBA, 512, 2)} - ${formatLBA(binEndLBA, 512, 2)}<br/>`;
                    res += `(LBA: ${currentBinLBA} - ${binEndLBA})<br/>`;
                    res += `${params[0].seriesName}: ${params[0].value}`;
                    return res;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '20%', containLabel: true },
            xAxis: {
                type: 'category',
                data: commonXAxisDataFormatted, // 使用格式化后的X轴数据
                name: 'Offset起始',
                nameLocation: 'middle',
                nameGap: 56,
                 axisLabel: {
                    // interval: 0, // 强制显示所有标签
                    rotate: 45 // 旋转标签避免重叠
                 }
            },
            yAxis: { type: 'value', name: '写IO数量' },
            series: [
                {
                    name: '写IO数量',
                    type: 'bar',
                    data: histogramWriteData,
                    itemStyle: { color: '#DC3912' }
                }
            ],
             dataZoom: [ // 为柱状图添加 dataZoom
                {
                    type: 'inside',
                    xAxisIndex: 0,
                    filterMode: 'none'
                },
                {
                    type: 'slider',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    height: 20,
                    bottom: 10
                }
            ]
        });

        window.addEventListener('resize', () => {
            if(rwCountChart) rwCountChart.resize();
            if(offsetTimeChart) offsetTimeChart.resize();
            if(offsetHistogramReadChart) offsetHistogramReadChart.resize();
            if(offsetHistogramWriteChart) offsetHistogramWriteChart.resize();
        });
    }
    updatePageTitle();
});