export const OG_WRAP_CSS = `<style>
.og-wrap { max-width: 100%; color: #222; }
.og-wrap .answer-box { background: #f0f6ff; border-radius: 10px; padding: 22px 26px; margin-bottom: 20px; }
.og-wrap .answer-box .q { font-size: 0.83rem; color: #888; margin-bottom: 8px; font-weight: 600; }
.og-wrap .answer-box .a { font-size: 1.05rem; font-weight: 700; color: #1a3a5c; line-height: 1.8; }
.og-wrap .answer-box .a span { color: #2d7dd2; }
.og-wrap .answer-box .detail { font-size: 0.87rem; color: #557; margin-top: 10px; line-height: 1.75; border-top: 1px solid #d0e4f7; padding-top: 10px; }
.og-wrap h2 { font-size: 1.18rem; font-weight: 700; margin: 44px 0 14px; color: #111; padding-left: 12px; border-left: 4px solid #2d7dd2; }
.og-wrap h3 { font-size: 1rem; font-weight: 700; margin: 26px 0 10px; color: #333; }
.og-wrap p { font-size: 0.96rem; line-height: 1.95; margin-bottom: 14px; color: #333; }
.og-wrap table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 0.9rem; }
.og-wrap th { background: #2d7dd2; color: #fff; padding: 10px 14px; text-align: left; font-weight: 600; }
.og-wrap td { padding: 9px 14px; border-bottom: 1px solid #eee; vertical-align: top; }
.og-wrap tr:nth-child(even) td { background: #f7faff; }
.og-wrap td:first-child { font-weight: 600; color: #2d7dd2; width: 28%; }
.og-wrap .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0 24px; }
.og-wrap .table-wrap table { margin: 0; }
.og-wrap .info-box { background: #f0f6ff; border-left: 4px solid #2d7dd2; padding: 14px 20px; margin: 20px 0; border-radius: 0 6px 6px 0; font-size: 0.93rem; line-height: 1.85; color: #1a3a5c; }
.og-wrap .preview { font-size: 0.87rem; color: #bbb; text-align: right; margin-top: 4px; font-style: italic; }
.og-wrap .source { font-size: 0.77rem; color: #bbb; margin: -10px 0 20px; }
.og-wrap .stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0 8px; }
.og-wrap .stat-box { background: #f7faff; border-radius: 8px; padding: 14px; text-align: center; }
.og-wrap .stat-box .num { font-size: 1.2rem; font-weight: 700; color: #2d7dd2; }
.og-wrap .stat-box .lbl { font-size: 0.77rem; color: #888; margin-top: 4px; }
.og-wrap .warn { background: #fff3f3; border-left: 4px solid #e24b4a; padding: 12px 20px; margin: 16px 0; border-radius: 0 6px 6px 0; font-size: 0.88rem; line-height: 1.8; color: #600; }
.og-wrap .faq-item { border-bottom: 1px solid #eee; padding: 22px 0; }
.og-wrap .faq-item:last-child { border-bottom: none; }
.og-wrap .faq-q { font-weight: 700; color: #111; font-size: 0.98rem; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start; }
.og-wrap .faq-q .tag { background: #2d7dd2; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
.og-wrap .faq-a { font-size: 0.93rem; line-height: 1.9; color: #444; padding-left: 22px; }
.og-wrap .faq-source { font-size: 0.8rem; color: #bbb; margin-top: 6px; }
.og-wrap .conclusion-box { background: #1a3a5c; border-radius: 10px; padding: 26px 28px; margin: 36px 0 20px; color: #fff; }
.og-wrap .conclusion-box .title { font-size: 0.85rem; color: #8ab0d4; margin-bottom: 12px; font-weight: 600; }
.og-wrap .conclusion-box .body { font-size: 1rem; line-height: 1.9; color: #e8f1fb; }
.og-wrap .conclusion-box .body strong { color: #fff; }
.og-wrap .conclusion-box .cta { margin-top: 16px; padding-top: 14px; border-top: 1px solid #2d5a8a; font-size: 0.88rem; color: #8ab0d4; }
.og-wrap .conclusion-box .cta a { color: #79b8f8; text-decoration: none; }
.og-wrap .disclaimer { font-size: 0.79rem; color: #bbb; background: #f8f8f8; padding: 14px 18px; border-radius: 6px; line-height: 1.72; margin-top: 28px; }
@media (max-width: 640px) {
  .og-wrap .answer-box { padding: 16px 18px; }
  .og-wrap .answer-box .a { font-size: 0.97rem; }
  .og-wrap h2 { font-size: 1.05rem; margin: 32px 0 12px; }
  .og-wrap p { font-size: 0.92rem; }
  .og-wrap .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0 24px; }
  .og-wrap .table-wrap table { margin: 0; min-width: 480px; }
  .og-wrap .stat-row { grid-template-columns: 1fr 1fr; gap: 8px; }
  .og-wrap .stat-box .num { font-size: 1rem; }
  .og-wrap .info-box { padding: 12px 14px; font-size: 0.88rem; }
  .og-wrap .conclusion-box { padding: 20px 18px; }
  .og-wrap .conclusion-box .body { font-size: 0.92rem; }
  .og-wrap .faq-a { padding-left: 14px; font-size: 0.88rem; }
  .og-wrap .disclaimer { font-size: 0.76rem; padding: 12px 14px; }
}
</style>`;
