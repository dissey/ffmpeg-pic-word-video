<template>
  <div class="container">
    <video v-if="video" :src="video" controls width="640" />
    <div v-else class="video-placeholder">视频预览区域</div>

    <div v-if="weatherInfo" class="weather-info">
      当前日期：{{ new Date().toLocaleDateString() }}
      <br />
      今天天气：
      {{ weatherInfo }}
    </div>

    <div class="input-group">
      <input
        type="text"
        v-model="overlayText"
        placeholder="输入要显示的文字"
        :disabled="isProcessing"
      />
    </div>
    <div class="input-group">
      <label>背景音乐：</label><br />
      <input type="file" accept="audio/*" @change="handleAudioUpload" />
    </div>

    <div class="file-input">
      <label>插图：</label><br />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        @change="handleFileUpload"
        :disabled="isProcessing"
      />
      <small>支持 JPG/PNG 格式，每张图片不超过 5MB，最多 10 张</small>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <button
      @click="transcode"
      :disabled="isProcessing || !selectedFiles.length"
    >
      {{ isProcessing ? "处理中..." : "生成视频" }}
    </button>

    <div class="status-message" v-if="message">
      {{ message }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

const ffmpeg = createFFmpeg({ log: true });
const video = ref("");
const message = ref("");
const selectedFiles = ref([]);
const overlayText = ref(""); // 新增文字输入的响应式变量
const audioFile = ref(null);
const weatherInfo = ref("");
const isProcessing = ref(false);
const error = ref(null);

// 在组件加载时获取天气和图片
onMounted(async () => {
  // 生成10张图片的路径数组
  try {
    const files = [];

    // 直接导入10张图片
    for (let i = 1; i <= 10; i++) {
      try {
        // 动态导入每张图片
        const module = await import(`./assets/shotPic/weibo_topic_${i}.png`);
        const response = await fetch(module.default);
        const blob = await response.blob();

        files.push(
          new File([blob], `weibo_topic_${i}.png`, { type: "image/png" })
        );

        console.log(`成功加载图片 ${i}`);
      } catch (err) {
        console.warn(`加载图片 ${i} 失败:`, err);
      }
    }

    selectedFiles.value = files;
    console.log(
      "已加载图片:",
      selectedFiles.value.map((f) => f.name)
    );
  } catch (error) {
    console.error("加载图片失败:", error);
  }
  getWeather();
});

// 检查文件大小和类型
function validateFiles(files) {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > maxSize) {
      throw new Error(`文件 "${file.name}" 太大，请选择小于 5MB 的图片`);
    }
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`文件 "${file.name}" 格式不支持，请选择 JPG 或 PNG 图片`);
    }
  }
}
// 获取天气信息
async function getWeather() {
  try {
    message.value = "获取天气信息...";
    // 使用高德地图 API 获取天气
    // 请替换 YOUR_API_KEY 为你的高德地图 API Key
    const response = await fetch(
      `https://api.seniverse.com/v3/weather/now.json?key=Ss9JjDJkSRhz0AKyN&location=jinhua&language=zh-Hans&unit=c`
    );
    const data = await response.json();
    const weather = data.results[0].now;
    console.log(weather);
    weatherInfo.value = `${weather.text} ${weather.temperature}°C`;
    message.value = "天气信息获取成功";
  } catch (error) {
    console.error("获取天气失败:", error);
    weatherInfo.value = new Date().toLocaleDateString();
  }
}

const handleFileUpload = (e) => {
  try {
    error.value = null;
    const files = Array.from(e.target.files);

    if (files.length === 0) {
      throw new Error("请选择图片文件");
    }
    if (files.length > 10) {
      throw new Error("最多只能选择10张图片");
    }

    validateFiles(files);
    selectedFiles.value = files;
    message.value = `已选择 ${files.length} 张图片`;
  } catch (err) {
    error.value = err.message;
    selectedFiles.value = [];
    e.target.value = ""; // 清空文件输入
  }
};
const handleAudioUpload = (e) => {
  audioFile.value = e.target.files[0];
};

// 添加图片预处理函数
async function resizeImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      // 设置更小的目标尺寸
      const targetWidth = 640; // 降到 640x360
      const targetHeight = 360;

      // 设置 canvas 尺寸
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // 绘制图片（强制缩放到目标尺寸）
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // 转换为低质量的 JPEG
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        0.6 // 降低质量到 0.6
      );
    };

    img.src = URL.createObjectURL(file);
  });
}

async function transcode() {
  try {
    error.value = null;
    isProcessing.value = true;

    message.value = "Loading ffmpeg-core.js";
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    // 写入字体文件（支持中文）
    message.value = "加载字体文件";
    const fontResponse = await fetch("/font.otf");
    const fontData = await fontResponse.arrayBuffer();
    ffmpeg.FS("writeFile", "font.otf", new Uint8Array(fontData));

    message.value = "开始处理";

    // 写入所有图片文件
    for (let i = 0; i < selectedFiles.value.length; i++) {
      const file = selectedFiles.value[i];
      message.value = `处理第 ${i + 1} 张图片`;
      const resizedBlob = await resizeImage(file);
      // 检查处理后的图片大小
      if (resizedBlob.size > 1024 * 1024) {
        message.value = `警告：第 ${i + 1} 张图片仍然较大 (${Math.round(
          resizedBlob.size / 1024
        )}KB)`;
      }

      ffmpeg.FS("writeFile", `image${i}.jpg`, await fetchFile(resizedBlob));
    }
    // 构建输入文件列表
    const inputs = [];
    const filterComplex = [];

    // 为每个图片添加输入和转场
    for (let i = 0; i < selectedFiles.value.length; i++) {
      inputs.push("-loop", "1", "-t", "3", "-i", `input_${i + 1}.png`);
      filterComplex.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);
    }

    // 构建连接字符串
    const concat = filterComplex.map((_, i) => `[v${i}]`).join("");
    filterComplex.push(
      `${concat}concat=n=${selectedFiles.value.length}:v=1:a=0[outv]`
    );

    // 如果有音频文件，写入音频
    if (audioFile.value) {
      message.value = "处理音频文件";
      await ffmpeg.FS(
        "writeFile",
        "audio.mp3",
        await fetchFile(audioFile.value)
      );
    }

    message.value = "开始生成视频";
    const PER_IMAGE_DURATION = 3; // 每张图片的持续时间（秒）
    const duration = selectedFiles.value.length * PER_IMAGE_DURATION;

    // 运行 FFmpeg 命令将图片转换为视频
    let args = [
      "-framerate",
      `1/${PER_IMAGE_DURATION}`, // 动态设置帧率
      "-pattern_type",
      "glob",
      "-i",
      "image*.jpg",
    ];
    // 如果有音频，添加音频相关参数
    if (audioFile.value) {
      args.push("-i", "audio.mp3", "-shortest"); // -shortest 确保视频长度与最短的输入流匹配
    }

    const textFilter = overlayText.value
      ? `drawtext=fontfile=font.otf:text='${overlayText.value.replace(
          /(.{20})/g,
          "$1\n"
        )}':fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h/8:line_spacing=20:`
      : null;
    // 添加滤镜
    args.push(
      "-vf",
      [
        `scale=640:360`,
        `drawtext=fontfile=font.otf:text='${weatherInfo.value}':fontsize=12:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=3:x=(w-text_w)/2:y=10`,
        textFilter,
      ]
        .filter(Boolean)
        .join(",")
    );

    // 添加编码器设置
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p" // 增加兼容性
    );

    // 如果有音频，添加音频设置
    if (audioFile.value) {
      args.push("-c:a", "aac", "-shortest");
    }

    // 设置持续时间
    args.push("-t", String(duration));

    // 输出文件
    args.push("-y", "output.mp4");

    // 执行命令
    await ffmpeg.run(...args);
    console.log(args);

    message.value = "视频生成完成，准备播放";

    // 读取输出视频
    const data = ffmpeg.FS("readFile", "output.mp4");
    video.value = URL.createObjectURL(
      new Blob([data.buffer], { type: "video/mp4" })
    );

    // 清理文件系统
    message.value = "清理临时文件";
    selectedFiles.value.forEach((_, i) => {
      try {
        ffmpeg.FS("unlink", `image${i}.jpg`);
      } catch (e) {
        console.warn(`清理图片 ${i} 失败:`, e);
      }
    });
    if (audioFile.value) {
      try {
        ffmpeg.FS("unlink", "audio.mp3");
      } catch (e) {
        console.warn("清理音频失败:", e);
      }
    }
    try {
      ffmpeg.FS("unlink", "output.mp4");
    } catch (e) {
      console.warn("清理输出文件失败:", e);
    }

    message.value = "处理完成";
  } catch (err) {
    error.value = err.message;
    message.value = "处理失败";
    console.error("完整错误信息:", err);
  } finally {
    isProcessing.value = false;
  }
}
</script>

<style scoped>
.container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.video-placeholder {
  width: 640px;
  height: 360px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  border-radius: 4px;
}

.weather-info {
  margin: 10px 0;
  padding: 8px 16px;
  background-color: #f0f0f0;
  border-radius: 4px;
  display: inline-block;
}

.input-group {
  margin: 15px 0;
}

.input-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.file-input {
  margin: 15px 0;
}

.file-input small {
  display: block;
  margin-top: 5px;
  color: #666;
}

.error-message {
  color: #dc3545;
  padding: 10px;
  margin: 10px 0;
  background-color: #ffe6e6;
  border-radius: 4px;
}

.status-message {
  margin-top: 10px;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

button {
  padding: 8px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
