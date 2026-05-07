use std::path::PathBuf;

/// 系统字体配置
pub struct FontConfig {
    /// 默认中文字体
    pub default_chinese_font: Option<String>,
}

impl FontConfig {
    /// 自动检测系统字体
    pub fn detect() -> Self {
        let font_dirs = Self::get_font_dirs();
        let default_chinese_font = Self::detect_chinese_font(&font_dirs);

        Self {
            default_chinese_font,
        }
    }

    /// 获取系统字体目录
    fn get_font_dirs() -> Vec<PathBuf> {
        let mut font_dirs = Vec::new();

        #[cfg(target_os = "windows")]
        {
            if let Ok(windir) = std::env::var("WINDIR") {
                font_dirs.push(PathBuf::from(windir).join("Fonts"));
            }
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                font_dirs.push(
                    PathBuf::from(local_app_data)
                        .join("Microsoft")
                        .join("Windows")
                        .join("Fonts"),
                );
            }
        }

        #[cfg(target_os = "macos")]
        {
            font_dirs.push(PathBuf::from("/System/Library/Fonts"));
            font_dirs.push(PathBuf::from("/Library/Fonts"));
            if let Ok(home) = std::env::var("HOME") {
                font_dirs.push(PathBuf::from(home).join("Library/Fonts"));
            }
        }

        #[cfg(target_os = "linux")]
        {
            font_dirs.push(PathBuf::from("/usr/share/fonts"));
            font_dirs.push(PathBuf::from("/usr/local/share/fonts"));
            if let Ok(home) = std::env::var("HOME") {
                let home_path = PathBuf::from(&home);
                font_dirs.push(home_path.join(".local/share/fonts"));
                font_dirs.push(PathBuf::from(home).join(".fonts"));
            }
        }

        font_dirs
    }

    /// 检测系统中可用的中文字体
    fn detect_chinese_font(font_dirs: &[PathBuf]) -> Option<String> {
        let chinese_fonts = [
            "Microsoft YaHei",      // Windows 微软雅黑
            "SimSun",               // Windows 宋体
            "SimHei",               // Windows 黑体
            "PingFang SC",          // macOS 苹方
            "Hiragino Sans GB",     // macOS 冬青黑体
            "STHeiti",              // macOS 华文黑体
            "Noto Sans CJK SC",     // Linux 思源黑体
            "WenQuanYi Micro Hei",  // Linux 文泉驿
            "Source Han Sans SC",   // 思源黑体
        ];

        for font_dir in font_dirs {
            if !font_dir.exists() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(font_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    for chinese_font in &chinese_fonts {
                        if name.contains(chinese_font)
                            || name
                                .to_lowercase()
                                .contains(&chinese_font.to_lowercase())
                        {
                            return Some(chinese_font.to_string());
                        }
                    }
                }
            }
        }

        None
    }

    /// 生成 CSS font-family 声明
    pub fn generate_font_family_css(&self) -> String {
        let fallbacks = [
            "-apple-system",
            "BlinkMacSystemFont",
            "\"Segoe UI\"",
            "Roboto",
            "\"Helvetica Neue\"",
            "Arial",
            "sans-serif",
        ];

        let mut families = Vec::new();
        if let Some(ref cn_font) = self.default_chinese_font {
            families.push(format!("\"{}\"", cn_font));
        }
        families.extend(fallbacks.into_iter().map(String::from));

        format!("font-family: {};", families.join(", "))
    }
}
