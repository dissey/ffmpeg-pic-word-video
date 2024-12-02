//打开cmd输入node screenshot实现截图抓取

const puppeteer = require("puppeteer");
const http = require("http");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkLoginStatus(page) {
  return await page.evaluate(() => {
    const selectors = [
      ".woo-avatar-main",
      ".Frame_top_2Zcp0",
      ".woo-box-flex.woo-tab-nav",
      ".Nav_main_2xQQB",
    ];
    return selectors.some(
      (selector) => document.querySelector(selector) !== null
    );
  });
}
async function waitForContent(page) {
  console.log("等待内容加载...");

  // 等待主要内容加载
  for (let attempt = 0; attempt < 10; attempt++) {
    const isLoaded = await page.evaluate(() => {
      // 检查是否有微博内容
      const posts = document.querySelectorAll(".card-wrap, .content, .wb-item");
      if (posts.length === 0) return false;

      // 检查图片是否加载完成
      const images = Array.from(document.querySelectorAll("img"));
      const imagesLoaded = images.every((img) => img.complete);

      // 检查是否有加载中的提示
      const hasLoadingTip =
        document.body.innerText.includes("正在加载") ||
        document.body.innerText.includes("loading");

      return posts.length > 0 && imagesLoaded && !hasLoadingTip;
    });

    if (isLoaded) {
      console.log("内容已加载完成");
      return true;
    }

    console.log(`等待内容加载，尝试 ${attempt + 1}/10`);
    await sleep(2000);
  }

  return false;
}

async function getContentArea(page) {
  try {
    // 获取内容区域并限制高度
    const contentArea = await page.evaluate(() => {
      const mainContent =
        document.querySelector(".m-main") ||
        document.querySelector("#pl_feedlist_index") ||
        document.querySelector(".card-wrap:first-child")?.parentElement;

      if (!mainContent) return null;

      // 只获取前2条微博
      const posts = Array.from(document.querySelectorAll(".card-wrap"))
        .filter((card) => {
          return (
            !card.innerText.includes("广告") &&
            !card.querySelector("[ad-data]") &&
            card.offsetHeight > 100
          );
        })
        .slice(0, 2); // 限制为2条微博

      if (posts.length === 0) return null;

      const firstPost = posts[0];
      const lastPost = posts[posts.length - 1];

      // 计算区域，严格限制高度
      return {
        x: Math.max(0, mainContent.offsetLeft),
        y: Math.max(0, firstPost.offsetTop - 20), // 上方留出20px空间
        width: Math.min(1280, mainContent.offsetWidth || firstPost.offsetWidth),
        height: Math.min(
          600, // 最大高度限制为600px
          lastPost.offsetTop + lastPost.offsetHeight - firstPost.offsetTop + 40
        ), // 下方留出20px空间
      };
    });
  } catch (error) {
    console.error("计算内容区域时出错:", error);
    return null;
  }
}

async function captureWeiboHeadlines() {
  let browser = null;
  let page = null;

  try {
    // 连接到已打开的 Chrome
    browser = await puppeteer.connect({
      browserURL: "http://127.0.0.1:9222",
      defaultViewport: null,
    });

    console.log("成功连接到Chrome浏览器");

    // 获取所有打开的页面
    const pages = await browser.pages();
    console.log(`当前打开的标签页数量: ${pages.length}`);

    // 查找微博页面或使用当前活动页面
    let page = pages.find((p) => p.url().includes("weibo.com"));
    if (!page) {
      page = pages[0]; // 使用第一个页面
      console.log("在当前页面打开微博");
      await page.goto("https://weibo.com", {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
    } else {
      console.log("找到已打开的微博页面");
    }
    // 设置视口尺寸
    await page.setViewport({
      width: 1280,
      height: 900, // 高度
    });

    // 设置用户代理
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );

    // 监听网络请求完成情况
    // let pendingRequests = 0;
    // page.on("request", () => pendingRequests++);
    // page.on("requestfinished", () => pendingRequests--);
    // page.on("requestfailed", () => pendingRequests--);
    // console.log("开始登录流程...");

    await sleep(2000);

    // 点击登录按钮
    // const loginButton = await page.$(".woo-button-main");
    // if (loginButton) {
    //   await loginButton.click();
    //   await sleep(2000);
    // } else {
    //   throw new Error("找不到登录按钮");
    // }

    // 等待登录框出现
    // await page.waitForSelector(".woo-input-main", { timeout: 5000 });

    // 获取输入框
    // const inputs = await page.$$(".woo-input-main");
    // if (inputs.length >= 2) {
    //   await inputs[0].type("17858936023", { delay: 100 });
    //   await inputs[1].type("Txm616528606", { delay: 100 });
    // } else {
    //   throw new Error("找不到输入框");
    // }

    // // 点击登录按钮
    // const submitButton = await page.$(".rounded-full");
    // if (submitButton) {
    //   await submitButton.click();
    // }

    console.log("等待登录验证...");

    // 等待登录成功
    let loginSuccess = false;
    for (let i = 0; i < 30; i++) {
      await sleep(10000);
      loginSuccess = await checkLoginStatus(page);
      if (loginSuccess) {
        console.log("登录成功！");
        break;
      }

      // 检查是否需要验证码
      const needVerify = await page.evaluate(() => {
        return (
          document.body.innerText.includes("验证码") ||
          document.body.innerText.includes("安全验证")
        );
      });

      if (needVerify) {
        console.log("请在浏览器中完成验证...");
      }
    }

    if (!loginSuccess) {
      throw new Error("登录超时");
    }

    // 保存cookies
    const cookies = await page.cookies();
    require("fs").writeFileSync(
      "./cookies.json",
      JSON.stringify(cookies, null, 2)
    );

    // 确保页面完全加载
    await sleep(3000);

    // 获取热搜话题
    console.log("获取热搜数据...");
    const response = await fetch("https://weibo.com/ajax/side/hotSearch");
    const data = await response.json();

    if (!data?.data?.realtime) {
      throw new Error("获取热搜失败");
    }

    const topics = data.data.realtime.slice(0, 10);

    // 遍历热搜话题
    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      try {
        console.log(`\n获取第 ${i + 1} 个话题: ${topic.note}`);

        const topicUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(
          topic.note
        )}`;
        console.log(`访问: ${topicUrl}`);

        // 访问话题页面
        await page.goto(topicUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        // 等待页面加载
        await sleep(5000);

        // 等待内容完全加载
        const contentLoaded = await waitForContent(page);
        if (!contentLoaded) {
          console.log("内容加载可能不完整，但继续处理");
        }

        // 等待网络请求完成
        // let networkWaitAttempts = 0;
        // while (pendingRequests > 0 && networkWaitAttempts < 10) {
        //   await sleep(1000);
        //   networkWaitAttempts++;
        //   console.log(`等待网络请求完成，剩余 ${pendingRequests} 个请求`);
        // }

        // 最后再等待一下以确保渲染完成
        await sleep(3000);

        // 移除遮挡元素
        // await page.evaluate(() => {
        //   const removeSelectors = [
        //     ".woo-box-flex",
        //     ".woo-modal-wrap",
        //     ".woo-toast-wrap",
        //     ".woo-dialog-wrap",
        //     ".m-layer",
        //     ".m-top-bar",
        //     "[ad-data]",
        //     ".loading-more",
        //     ".m-panel", // 顶部面板
        //     ".m-top-bar", // 顶部栏
        //     ".m-page-bar", // 分页栏
        //   ];

        //   removeSelectors.forEach((selector) => {
        //     document.querySelectorAll(selector).forEach((el) => {
        //       if (el) el.remove();
        //     });
        //   });
        // });

        // 获取内容区域
        const contentArea = await getContentArea(page);

        // 截图
        if (contentArea) {
          // 添加调试截图
          await page.screenshot({
            path: `debug_full_${i + 1}.png`,
            fullPage: true,
          });

          // 截取指定区域
          await page.screenshot({
            path: `weibo_topic_${i + 1}.png`,
            clip: {
              x: contentArea.x,
              y: contentArea.y,
              width: contentArea.width,
              height: contentArea.height,
            },
          });

          console.log(`已保存第 ${i + 1} 个话题的截图，区域:`, contentArea);
        } else {
          // 备用方案：截取固定区域
          await page.screenshot({
            path: `weibo_topic_${i + 1}.png`,
            clip: {
              x: 0,
              y: 0,
              width: 1280,
              height: 900,
            },
          });
        }

        console.log(`已保存第 ${i + 1} 个话题的截图`);

        // 随机等待
        const waitTime = 3000 + Math.random() * 2000;
        await sleep(waitTime);
      } catch (error) {
        console.error(`获取第 ${i + 1} 个话题失败:`, error);
        // 保存错误截图
        await page.screenshot({
          path: `error_topic_${i + 1}.png`,
          fullPage: true,
        });
        continue;
      }
    }
  } catch (error) {
    console.error("程序执行错误:", error);
    if (page) {
      await page.screenshot({ path: "error.png" });
    }
  }
}

// 运行前需要先启动 Chrome，使用以下命令：
// Windows:
// "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
// Mac:
// /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
// Linux:
// google-chrome --remote-debugging-port=9222

// 运行程序
console.log("开始运行...");
captureWeiboHeadlines().catch(console.error);
