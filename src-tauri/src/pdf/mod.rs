pub mod browser_pool;
pub mod chrome;
pub mod converter;
pub mod engine;
pub mod error;
pub mod fonts;

use serde::{Deserialize, Serialize};

/// PDF 导出选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfExportOptions {
    /// 页边距 (毫米)
    pub margin_mm: f32,
    /// 页面格式
    pub page_format: PageFormat,
    /// 页面方向
    pub orientation: PageOrientation,
    /// 是否包含页眉页脚
    pub include_header_footer: bool,
}

/// 页面格式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PageFormat {
    A4,
    A3,
    Letter,
    Legal,
}

impl Default for PageFormat {
    fn default() -> Self {
        PageFormat::A4
    }
}

/// 页面方向
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PageOrientation {
    Portrait,
    Landscape,
}

impl Default for PageOrientation {
    fn default() -> Self {
        PageOrientation::Portrait
    }
}

impl Default for PdfExportOptions {
    fn default() -> Self {
        Self {
            margin_mm: 20.0,
            page_format: PageFormat::A4,
            orientation: PageOrientation::Portrait,
            include_header_footer: false,
        }
    }
}

impl PdfExportOptions {
    /// 获取页面宽度 (英寸)
    pub fn paper_width(&self) -> f64 {
        match self.page_format {
            PageFormat::A4 => 8.27,
            PageFormat::A3 => 11.69,
            PageFormat::Letter => 8.5,
            PageFormat::Legal => 8.5,
        }
    }

    /// 获取页面高度 (英寸)
    pub fn paper_height(&self) -> f64 {
        match self.page_format {
            PageFormat::A4 => 11.69,
            PageFormat::A3 => 16.54,
            PageFormat::Letter => 11.0,
            PageFormat::Legal => 14.0,
        }
    }
}