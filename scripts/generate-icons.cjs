const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconsDir = path.join(__dirname, '../src-tauri/icons');

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 创建一个简单的Markdown图标 (带有M字母的圆形图标)
async function createIcon(size) {
  const svg = `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#4a90d9"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="${size * 0.5}" font-weight="bold" fill="white">
      Md
    </text>
  </svg>`;
  return svg;
}

async function generateIcons() {
  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.ico', size: 256, isIco: true },
    { name: 'icon.icns', size: 512, isIcns: true }
  ];

  for (const { name, size, isIco } of sizes) {
    const svg = await createIcon(size);
    const outputPath = path.join(iconsDir, name);

    if (isIco) {
      // 对于ICO文件，我们需要先生成PNG，然后转换
      const pngBuffer = await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toBuffer();

      // 创建简单的ICO文件
      // ICO文件头 + PNG数据
      const pngData = pngBuffer;
      const icoHeader = Buffer.alloc(6);
      icoHeader.writeUInt16LE(0, 0); // 保留，必须为0
      icoHeader.writeUInt16LE(1, 2); // 图像类型：1=ICO
      icoHeader.writeUInt16LE(1, 4); // 图像数量

      // ICO目录条目
      const icoDir = Buffer.alloc(16);
      icoDir.writeUInt8(size > 255 ? 0 : size, 0);  // 宽度
      icoDir.writeUInt8(size > 255 ? 0 : size, 1);  // 高度
      icoDir.writeUInt8(0, 2);  // 颜色数
      icoDir.writeUInt8(0, 3);  // 保留
      icoDir.writeUInt8(0, 4);  // 颜色平面
      icoDir.writeUInt8(0, 5);  // 位深度
      icoDir.writeUInt32LE(pngData.length, 8);  // 图像数据大小
      icoDir.writeUInt32LE(22, 12);  // 图像数据偏移量

      const icoFile = Buffer.concat([icoHeader, icoDir, pngData]);
      fs.writeFileSync(outputPath, icoFile);
      console.log(`Created: ${name}`);
    } else {
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Created: ${name}`);
    }
  }

  // 创建app-icon.png (1024x1024)
  const appIconSvg = await createIcon(1024);
  await sharp(Buffer.from(appIconSvg))
    .png()
    .toFile(path.join(iconsDir, 'app-icon.png'));
  console.log('Created: app-icon.png');
}

generateIcons().catch(console.error);