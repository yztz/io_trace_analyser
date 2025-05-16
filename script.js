// script.js
document.addEventListener('DOMContentLoaded', async () => { // 使其成为 async 函数
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusMessage = document.getElementById('status-message');

    const rwCountChartDiv = document.getElementById('rw-count-chart');
    const offsetTimeChartDiv = document.getElementById('offset-time-chart');
    const offsetHistogramReadChartDiv = document.getElementById('offset-histogram-read-chart');
    const offsetHistogramWriteChartDiv = document.getElementById('offset-histogram-write-chart');
    const p99InfoDiv = document.getElementById('p99-info');

    // 新增: 分享功能相关的 DOM 元素 (将在阶段三添加HTML)
    const shareButton = document.getElementById('share-button');
    const downloadButton = document.getElementById('download-button');
    const shareLinkContainer = document.getElementById('share-link-container');
    const shareLinkInput = document.getElementById('share-link-input');
    const copyLinkButton = document.getElementById('copy-link-button');

    const deleteButton = document.getElementById('delete-button');
    const confirmDialog = document.getElementById('confirm-dialog');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

    let rwCountChart, offsetTimeChart;
    let offsetHistogramReadChart, offsetHistogramWriteChart;

    let currentFileContent = null; // 用于存储当前文件的 ArrayBuffer，以便上传
    let currentFileName = null;    // 用于存储当前文件的名称
    let currentShortKey = null; // 存储当前文件的短键，用于删除操作

    // --- 配置: Worker URL ---
    // 部署 Worker 后，替换为你的 Worker URL
    const WORKER_BASE_URL = 'https://trace-worker.781089956.workers.dev';
    const AUTH_KEY = '781089956abc';

    async function uploadTraceFile(arrayBuffer, fileName) {
        statusMessage.textContent = '正在准备上传文件...';
        statusMessage.style.color = 'blue';
        shareButton.disabled = true;

        try {
            // 直接上传文件到Worker
            const uploadResponse = await fetch(`${WORKER_BASE_URL}/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Custom-Auth-Key': AUTH_KEY,
                    'X-Custom-Filename': fileName
                },
                body: arrayBuffer  // 直接发送ArrayBuffer
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({}));
                throw new Error(`上传失败: ${uploadResponse.status} ${errorData.details || uploadResponse.statusText}`);
            }

            const { shortUrl, shortKey, fileName: savedFileName } = await uploadResponse.json();

            // 生成分享链接
            // 分享链接指向当前页面，并带上短键作为参数
            const currentPageUrl = new URL(window.location.href);
            currentPageUrl.search = ''; // 清除现有参数
            currentPageUrl.searchParams.set('trace', shortKey);

            if (shareLinkInput) shareLinkInput.value = currentPageUrl.toString();
            if (shareLinkContainer) shareLinkContainer.style.display = 'block';

            statusMessage.textContent = `分享链接已生成！文件: ${savedFileName}`;
            statusMessage.style.color = 'green';

        } catch (error) {
            console.error("分享操作失败:", error);
            statusMessage.textContent = `分享失败: ${error.message}`;
            statusMessage.style.color = 'red';
            if (shareLinkContainer) shareLinkContainer.style.display = 'none';
        } finally {
            shareButton.disabled = false;
        }
    }

    if (shareButton) {
        shareButton.addEventListener('click', async () => {
            if (!currentFileContent || !currentFileName) {
                alert('没有可分享的文件。请先加载一个 .trace 文件。');
                return;
            }

            await uploadTraceFile(currentFileContent, currentFileName);
        });
    }

    if (copyLinkButton && shareLinkInput) {
        copyLinkButton.addEventListener('click', () => {
            shareLinkInput.select();
            shareLinkInput.setSelectionRange(0, 99999); // 兼容移动设备

            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    statusMessage.textContent = '链接已复制到剪贴板!';
                    statusMessage.style.color = 'blue';
                } else {
                    statusMessage.textContent = '复制失败。请手动复制。';
                    statusMessage.style.color = 'orange';
                }
            } catch (err) {
                console.warn('无法使用 execCommand 复制:', err);
                statusMessage.textContent = '自动复制失败。请手动选择并复制。';
                statusMessage.style.color = 'orange';
                // 可以尝试 navigator.clipboard.writeText 作为备选，但它需要安全上下文 (HTTPS)
                // navigator.clipboard.writeText(shareLinkInput.value).then(...);
            }
            setTimeout(() => {
                // 清理提示信息，或者可以保留最后的状态
                if (statusMessage.textContent.includes('剪贴板') || statusMessage.textContent.includes('复制失败')) {
                    // statusMessage.textContent = ''; // 或者恢复到之前的状态
                }
            }, 3000);
        });
    }

    function formatLBA(lba, sectorSize = 512, precision = 1) {
        if (lba === undefined || isNaN(lba)) return 'N/A';
        const bytes = lba * sectorSize;
        const KILOBYTE = 1024;
        const MEGABYTE = KILOBYTE * 1024;
        const GIGABYTE = MEGABYTE * 1024;
        const TERABYTE = GIGABYTE * 1024;

        if (bytes === 0) return `0.0 MB`;

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
            document.title = `${fileName}`;
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

        if (shareButton) shareButton.style.display = 'none';
        if (shareLinkContainer) shareLinkContainer.style.display = 'none';
        if (downloadButton) downloadButton.style.display = 'none';
        if (deleteButton) deleteButton.style.display = 'none';
    }

    async function handleReceivedTraceData(arrayBuffer, fileName = 'received_trace.trace', isShared = false) {
        statusMessage.textContent = `正在处理文件: ${fileName}...`;
        statusMessage.style.color = 'inherit';
        currentFileContent = arrayBuffer; // 存储 ArrayBuffer 用于后续上传
        currentFileName = fileName;       // 存储文件名

        const isFromShare = isShared;

        try {
            const textDecoder = new TextDecoder('utf-8');
            const content = textDecoder.decode(arrayBuffer);

            const traceData = parseTraceFile(content);
            if (traceData.length === 0) {
                statusMessage.textContent = '接收到的文件中未找到有效的 trace 数据。';
                statusMessage.style.color = 'orange';
                initCharts(); // 这会隐藏分享按钮
                updatePageTitle();
                currentFileContent = null;
                currentFileName = null;
                return;
            }
            statusMessage.textContent = `文件处理完毕，共 ${traceData.length} 条记录。`;
            analyzeAndPlotData(traceData);
            updatePageTitle(fileName);
            
            if (shareButton) shareButton.style.display = isFromShare ? 'none' : 'inline-block';
            if (shareLinkContainer) shareLinkContainer.style.display = 'none';
            if (downloadButton) downloadButton.style.display = 'inline-block';

        } catch (error) {
            console.error("处理接收到的文件时出错:", error);
            statusMessage.textContent = `处理接收到的文件时出错: ${error.message}`;
            statusMessage.style.color = 'red';
            initCharts(); // 这会隐藏分享按钮
            updatePageTitle();
            currentFileContent = null; // 清空内容
            currentFileName = null;
        }
    }

    // 检查消息是否包含我们期望的 trace 数据结构
    // 假设发送方发送的数据格式为 { ioTrace: { buffer: ArrayBuffer, fileName: string } }
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
        // 确保它最终调用 handleReceivedTraceData(arrayBuffer, fileName)
        if (event.data && event.data.ioTrace && event.data.ioTrace.buffer instanceof ArrayBuffer) {
            console.log('Analyser: Received valid trace data via postMessage.');
            const traceBuffer = event.data.ioTrace.buffer;
            const traceFileName = event.data.ioTrace.fileName || 'received_trace.trace';
            await handleReceivedTraceData(traceBuffer, traceFileName); // 使用 await
        } else {
            console.warn('Analyser: Received message with unexpected data format.', event.data);
        }
    });


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
            handleLocalFile(files[0]); // 改为调用 handleLocalFile
        }
    });

    fileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length) {
            handleLocalFile(files[0]); // 改为调用 handleLocalFile
        }
    });

    // 修改原 handleFile 为 handleLocalFile，专注于本地文件处理
    function handleLocalFile(file) {
        if (!file.name.endsWith('.trace')) {
            statusMessage.textContent = '错误：请上传 .trace 文件。';
            statusMessage.style.color = 'red';
            initCharts();
            currentFileContent = null;
            currentFileName = null;
            return;
        }

        if (deleteButton) deleteButton.style.display = 'none';
        currentShortKey = null;

        statusMessage.textContent = `正在处理本地文件: ${file.name}...`;
        statusMessage.style.color = 'inherit';

        const reader = new FileReader();
        reader.onload = async (e) => {
            // FileReader 读取的是 ArrayBuffer
            await handleReceivedTraceData(e.target.result, file.name);
        };
        reader.onerror = () => {
            statusMessage.textContent = '读取文件失败。';
            statusMessage.style.color = 'red';
            initCharts();
            updatePageTitle();
            currentFileContent = null;
            currentFileName = null;
            currentShortKey = null;
        };
        reader.readAsArrayBuffer(file); // 读取为 ArrayBuffer
    }

    function parseTraceFile(content) {
        let lines = content.split('\n');
        let traceEntries = [];
        let resetOccurred = false;
        let lastResetLineIndex = -1;

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

    function analyzeAndPlotData(data) {
        // 确保在开始时调用 initCharts() 以重置图表和分享按钮状态
        initCharts(); // 确保图表和分享按钮被正确初始化/重置

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
            <p><small>统计包含预写</small></p>
        `;

        const scatterDataRead = data.filter(d => d.rwFlag === 1).map(d => [d.time, d.offset, d.size]);
        const scatterDataWrite = data.filter(d => d.rwFlag === 0).map(d => [d.time, d.offset, d.size]);

        offsetTimeChart.setOption({
            title: { text: 'Offset vs. Time', left: 'center' },
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
            legend: { data: ['读 (Read)', '写 (Write)'], top: '30px' },
            grid: { left: '5%', right: '8%', bottom: '15%', containLabel: true },
            xAxis: {
                nameLocation: 'middle', nameGap: 26, type: 'value', name: 'time (ns)',
                axisLabel: { formatter: val => `${(val / 1e6).toFixed(0)}ms` }
            },
            yAxis: { type: 'value', name: 'Offset', axisLabel: { formatter: val => formatLBA(val, 512, 1) } },
            series: [
                {
                    name: '读 (Read)', type: 'scatter', symbolSize: 1, data: scatterDataRead,
                    itemStyle: { color: '#3366CC' }, large: true, largeThreshold: 2000,
                    progressive: 5000, progressiveThreshold: 5000
                },
                {
                    name: '写 (Write)', type: 'scatter', symbolSize: 1, data: scatterDataWrite,
                    itemStyle: { color: '#DC3912' }, large: true, largeThreshold: 2000,
                    progressive: 5000, progressiveThreshold: 5000
                }
            ],
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'empty' },
                { type: 'inside', yAxisIndex: 0, filterMode: 'empty' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'empty', height: 20, bottom: 10 },
                { type: 'slider', yAxisIndex: 0, filterMode: 'empty', width: 20, right: 10 }
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
            binSizeLBA = 64;
        } else if (maxOffsetMBValue < 100) {
            binSizeLBA = Math.max(64, Math.ceil(maxOffsetLBA / 400 / 64) * 64);
        } else if (maxOffsetMBValue < 1024) {
            binSizeLBA = (4 * 1024 * 1024) / 512;
        } else if (maxOffsetMBValue < 10240) {
            binSizeLBA = (16 * 1024 * 1024) / 512;
        } else {
            binSizeLBA = (32 * 1024 * 1024) / 512;
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
        const commonXAxisDataFormatted = histogramCategoriesLBA.map(lba => formatLBA(lba, 512, 1));

        // Read IO Offset Distribution
        offsetHistogramReadChart.setOption({
            title: { text: '读IO Offset分布', left: 'center' },
            tooltip: {
                trigger: 'axis', axisPointer: { type: 'shadow' },
                formatter: params => {
                    const currentBinIndex = params[0].dataIndex;
                    const currentBinLBA = histogramCategoriesLBA[currentBinIndex];
                    const binEndLBA = currentBinLBA + binSizeLBA - 1;
                    let res = `Offset Range: ${formatLBA(currentBinLBA, 512, 2)} - ${formatLBA(binEndLBA, 512, 2)}<br/>`;
                    res += `(LBA: ${currentBinLBA} - ${binEndLBA})<br/>`;
                    res += `${params[0].seriesName}: ${params[0].value}`;
                    return res;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '20%', containLabel: true },
            xAxis: {
                type: 'category', data: commonXAxisDataFormatted, name: 'Offset起始',
                nameLocation: 'middle', nameGap: 56, axisLabel: { rotate: 45 }
            },
            yAxis: { type: 'value', name: '读IO数量' },
            series: [{ name: '读IO数量', type: 'bar', data: histogramReadData, itemStyle: { color: '#3366CC' }}],
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 20, bottom: 10 }
            ]
        });

        offsetHistogramWriteChart.setOption({
            title: { text: '写IO Offset分布', left: 'center' },
            tooltip: {
                trigger: 'axis', axisPointer: { type: 'shadow' },
                formatter: params => {
                    const currentBinIndex = params[0].dataIndex;
                    const currentBinLBA = histogramCategoriesLBA[currentBinIndex];
                    const binEndLBA = currentBinLBA + binSizeLBA - 1;
                    let res = `Offset Range: ${formatLBA(currentBinLBA, 512, 2)} - ${formatLBA(binEndLBA, 512, 2)}<br/>`;
                    res += `(LBA: ${currentBinLBA} - ${binEndLBA})<br/>`;
                    res += `${params[0].seriesName}: ${params[0].value}`;
                    return res;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '20%', containLabel: true },
            xAxis: {
                type: 'category', data: commonXAxisDataFormatted, name: 'Offset起始',
                nameLocation: 'middle', nameGap: 56, axisLabel: { rotate: 45 }
            },
            yAxis: { type: 'value', name: '写IO数量' },
            series: [{ name: '写IO数量', type: 'bar', data: histogramWriteData, itemStyle: { color: '#DC3912' }}],
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 20, bottom: 10 }
            ]
        });

        window.addEventListener('resize', () => {
            if(rwCountChart) rwCountChart.resize();
            if(offsetTimeChart) offsetTimeChart.resize();
            if(offsetHistogramReadChart) offsetHistogramReadChart.resize();
            if(offsetHistogramWriteChart) offsetHistogramWriteChart.resize();
        });
    }


    // 更新从URL加载trace文件的函数
    async function loadRemoteTrace(shortKey) {
        statusMessage.textContent = `正在下载 trace 文件...`;
        statusMessage.style.color = 'inherit';
        if (shareButton) shareButton.style.display = 'none';
        if (shareLinkContainer) shareLinkContainer.style.display = 'none';

        currentShortKey = shortKey;

        try {
            // 使用短键从Worker获取文件
            const response = await fetch(`${WORKER_BASE_URL}/f/${shortKey}`);

            if (!response.ok) {
                throw new Error(`下载文件失败: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            // 首先尝试从自定义头部获取文件名
            let fileName = response.headers.get('X-Original-Filename');
            
            // 如果没有自定义头部，尝试从Content-Disposition获取
            if (!fileName) {
                const contentDisposition = response.headers.get('Content-Disposition');
                if (contentDisposition) {
                    // 改进正则表达式以更可靠地提取文件名
                    const matches = contentDisposition.match(/filename="([^"]*)"/) || 
                                contentDisposition.match(/filename=([^;]*)/);
                    if (matches && matches[1]) {
                        try {
                            fileName = decodeURIComponent(matches[1]);
                        } catch (e) {
                            // 如果解码失败，使用原始值
                            fileName = matches[1];
                        }
                    }
                }
            }
            
            // 如果仍然没有获取到文件名，使用默认名称
            if (!fileName) {
                fileName = 'shared_trace.trace';
            }

            await handleReceivedTraceData(arrayBuffer, fileName, true);
            if (deleteButton) deleteButton.style.display = 'inline-block';
        } catch (error) {
            console.error("加载远程 trace 文件失败:", error);
            statusMessage.textContent = `加载远程 trace 文件失败: ${error.message}`;
            statusMessage.style.color = 'red';
            initCharts();
            updatePageTitle();
            
            currentFileContent = null;
            currentFileName = null;
            currentShortKey = null;
            
            if (deleteButton) deleteButton.style.display = 'none';
        }
    }
    async function checkUrlForTrace() {
        const urlParams = new URLSearchParams(window.location.search);
        const traceKey = urlParams.get('trace');
        if (traceKey) {
            await loadRemoteTrace(traceKey);
        } else {
            updatePageTitle(); // 如果没有 trace 参数，正常更新标题
        }
    }

    async function deleteRemoteTrace(shortKey) {
        statusMessage.textContent = `正在删除共享文件...`;
        statusMessage.style.color = 'blue';
        
        try {
            const response = await fetch(`${WORKER_BASE_URL}/delete/${shortKey}`, {
                method: 'DELETE',
                headers: {
                    'X-Custom-Auth-Key': AUTH_KEY
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`删除失败: ${response.status} ${errorData.details || response.statusText}`);
            }
            
            // 删除成功
            statusMessage.textContent = `文件已成功删除!`;
            statusMessage.style.color = 'green';
            
            // 清除图表和相关数据
            initCharts();
            updatePageTitle();
            currentFileContent = null;
            currentFileName = null;
            currentShortKey = null;
            
            // 隐藏删除按钮
            if (deleteButton) deleteButton.style.display = 'none';
            
            // 可选：显示提示或重定向
            setTimeout(() => {
                statusMessage.textContent = `文件已删除。您可以上传新的文件进行分析。`;
            }, 3000);
            
        } catch (error) {
            console.error("删除共享文件失败:", error);
            statusMessage.textContent = `删除失败: ${error.message}`;
            statusMessage.style.color = 'red';
        }
    }

    if (deleteButton) {
        deleteButton.addEventListener('click', () => {
            if (!currentShortKey) {
                alert('没有可删除的共享文件。');
                return;
            }
            // 显示确认对话框
            confirmDialog.style.display = 'block';
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            // 隐藏对话框
            confirmDialog.style.display = 'none';
            // 执行删除操作
            if (currentShortKey) {
                await deleteRemoteTrace(currentShortKey);
            }
        });
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            // 只隐藏对话框
            confirmDialog.style.display = 'none';
        });
    }

    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            if (!currentFileContent || !currentFileName) {
                alert('没有可下载的文件。请先加载一个 .trace 文件。');
                return;
            }

            // 创建 Blob 对象
            const blob = new Blob([currentFileContent], { type: 'application/octet-stream' });

            // 创建下载链接
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentFileName.endsWith('.trace') ? currentFileName : `${currentFileName}.trace`; // 设置下载文件名

            // 触发下载
            document.body.appendChild(a);
            a.click();

            // 清理
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    initCharts(); // 初始化图表和UI状态
    await checkUrlForTrace(); // 检查 URL 参数
});