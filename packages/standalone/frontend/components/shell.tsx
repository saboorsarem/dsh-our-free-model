import { Coffee, Activity, BarChart3, BookOpen, Boxes, Cable, ChevronRight, Globe, Handshake, Image, LayoutDashboard, LogOut, MessageSquareWarning, Moon, Network, Palette, PanelsTopLeft, Puzzle, Route, RotateCw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, Monitor, LibraryBig, Wrench, Waves } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import type { ComponentType } from 'react'
import { flushSync } from 'react-dom'
import brandMark from '../../../../icon.svg?inline'
import { t, getLocale as locale, switchLocale } from '../i18n.mjs'
import { Badge, Button } from './ui'
import { useMotionSetting } from '../motion/hooks'
import { useMotionField } from '../motion/field'
import type { Host, Page, PluginPage, Summary } from '../types'
import { hasDesktopBridge } from '../desktop-update'

type NavIcon = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>
interface NavItem { id: Page; name: string; icon: NavIcon }
interface NavGroup { label: string; items: NavItem[] }

// The replacement gateway has no feedback collector and the old host is being
// retired. Keep the page implementation for a future self-hosted collector,
// but do not advertise an entry that can only answer 503.
export const FEEDBACK_ENABLED = false
const FEEDBACK_NAV: NavItem[] = FEEDBACK_ENABLED
  ? [{ id: 'feedback', name: '反馈与许愿', icon: MessageSquareWarning }]
  : []

const CORE_NAVIGATION: NavGroup[] = [
  { label: t('nav.workspace'), items: [
    { id: 'overview', name: t('nav.overview'), icon: LayoutDashboard },
    { id: 'workspace', name: t('nav.workbench'), icon: PanelsTopLeft },
    { id: 'agents', name: t('nav.agents'), icon: Monitor },
    { id: 'models', name: t('nav.models'), icon: Boxes },
    { id: 'usage', name: t('nav.usage'), icon: Activity },
    { id: 'library', name: t('nav.library'), icon: LibraryBig },
  ] },
  { label: t('nav.groupChannels'), items: [
    { id: 'providers', name: t('nav.providers'), icon: PanelsTopLeft },
    { id: 'routing', name: t('nav.routing'), icon: Route },
    { id: 'channels', name: t('nav.channels'), icon: Network },
    { id: 'eac', name: t('nav.eac'), icon: Handshake },
    { id: 'connection', name: t('nav.connection'), icon: Cable },
  ] },
  { label: t('nav.groupManage'), items: [
    { id: 'plugins', name: t('nav.plugins'), icon: Puzzle },
    { id: 'settings', name: t('nav.settings'), icon: Settings2 },
    { id: 'updates', name: t('nav.updates'), icon: RotateCw },
  ] },
  { label: t('nav.groupSponsor'), items: [
    ...FEEDBACK_NAV,
    { id: 'sponsor', name: t('nav.sponsor'), icon: Coffee },
  ] },
]

const PAGE_ICONS: Record<string, NavIcon> = {
  puzzle: Puzzle,
  sparkles: Sparkles,
  chart: BarChart3,
  tool: Wrench,
  image: Image,
  globe: Globe,
  terminal: Terminal,
  book: BookOpen,
  palette: Palette,
  activity: Activity,
  boxes: Boxes,
  route: Route,
}

export const pageIcon = (name: string): NavIcon => PAGE_ICONS[name] ?? Puzzle

/**
 * The sidebar is the only list of pages — nothing may restate it.
 *
 * `navigationPages` is the core whitelist (`App` derives it from the sidebar),
 * and `pageIdsFor` appends the plugin pages the console learned from
 * `/summary`. A page that is not in either list is silently unreachable, so
 * both the shell and the host must read the same source.
 *
 * 此前 `app.tsx` 自己又写了一份同样的数组，两份一漂移就出了「模型工作台」
 * 点了没反应 —— 侧边栏有这一项、白名单里没有，`navigate('workspace')` 直接被
 * `includes` 短路（#678）。从侧边栏**推导**而不是重述，是让两份永远不可能再
 * 漂移的唯一办法。
 */
export const navigationPages: Page[] = CORE_NAVIGATION.flatMap(group => group.items.map(item => item.id))

export function pageIdsFor(pluginPages: PluginPage[] = []): Page[] {
  return [...navigationPages, ...pluginPages.map(page => page.id)]
}

type Origin = { x: number; y: number }

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const apply = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('ofm-theme', next) } catch { /* 存储不可用时仅本次会话生效 */ }
    setTheme(next)
  }
  const toggle = (origin?: Origin) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // 没有 View Transition、或用户要求减少动效时直接切换，不做扩散。
    if (!origin || typeof document.startViewTransition !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return }
    const root = document.documentElement
    // 半径取按钮中心到视口最远角的距离，保证圆盘一定盖满整屏。
    const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    root.style.setProperty('--theme-reveal-x', `${origin.x}px`)
    root.style.setProperty('--theme-reveal-y', `${origin.y}px`)
    root.style.setProperty('--theme-reveal-r', `${radius}px`)
    // 扩散期间关掉 300ms 的底色过渡，否则"新主题"快照会抓到过渡中间色。
    root.classList.add('theme-transitioning')
    const transition = document.startViewTransition(() => { flushSync(() => apply(next)) })
    const finish = () => {
      root.classList.remove('theme-transitioning')
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    }
    transition.finished.then(finish, finish)
  }
  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')
  return <Button variant="ghost" className="theme-toggle" aria-label={label} title={theme === 'dark' ? t('nav.light') : t('nav.dark')}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>
    <span className="theme-toggle-track" data-theme={theme}>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true"><Sun size={13} /></span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true"><Moon size={13} /></span>
    </span>
  </Button>
}

/** 语言随 localStorage 持久化并由 switchLocale 重载页面，无需响应式状态。 */
export function LangToggle() {
  const next = locale() === 'zh' ? 'en' : 'zh'
  const label = next === 'en' ? t('nav.switchToEnglish') : t('nav.switchToChinese')
  return <Button variant="ghost" className="lang-toggle" aria-label={label} title={label} onClick={() => switchLocale(next)}>
    <span className={next === 'en' ? undefined : 'lang-toggle-cn'} aria-hidden="true">{next === 'en' ? 'EN' : '中'}</span>
  </Button>
}

/**
 * 动效开关。写 `data-motion` 到 <html>，motion.css 里的闸门立刻生效；
 * 偏好存 localStorage['ofm-motion']，与 theme.mjs 的主题键同一命名空间。
 */
function MotionToggle() {
  const [on, setOn] = useMotionSetting()
  return <Button variant="ghost" aria-label={on ? t('motion.disable') : t('motion.enable')} title={on ? t('motion.on') : t('motion.off')}
    onClick={() => setOn(!on)}>
    <Waves size={15} style={{ opacity: on ? 1 : .4 }} />
  </Button>
}

export const pageNames: Record<string, string> = Object.fromEntries(CORE_NAVIGATION.flatMap(group => group.items.map(item => [item.id, item.name])))

export function pageLabel(page: Page, pluginPages: PluginPage[] = []): string {
  return pluginPages.find(entry => entry.id === page)?.title ?? pageNames[page] ?? t('nav.pluginPage')
}

export function Sidebar({ page, summary, host, onDisclaimer, pluginPages = [] }: { page: Page; summary?: Summary; host: Host; onDisclaimer(): void; pluginPages?: PluginPage[] }) {
  // 装饰层挂到 document.body（见 motion/field.tsx 里的理由：外壳的
  // backdrop-filter 与 overflow 会成为 fixed 后代的裁剪容器）。
  useMotionField()
  // 窄屏侧边栏是横向滚动条带：切页后把当前项滚进视野（居中）。
  // 用 rect 差值而不是 offsetLeft —— 后者相对最近的定位祖先，
  // 在条带布局下会算错。scrollTo 只作用于这个容器，不会顶走页面。
  const navRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const scroll = () => {
      if (nav.scrollWidth <= nav.clientWidth) return
      const active = nav.querySelector<HTMLElement>('.console-nav-item.selected')
      if (!active) return
      const navRect = nav.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      const delta = activeRect.left - navRect.left - (nav.clientWidth - activeRect.width) / 2
      // 不用 behavior:'smooth' —— 无头/低功耗环境下可能被跳过，
      // 结果活动项留在视野外。这里直接跳到位，可靠优先。
      nav.scrollLeft = Math.max(0, nav.scrollLeft + delta)
    }
    scroll()
    // 首帧布局未稳定时再补一次；窗口尺寸变化（桌面→窄屏）也要重算。
    const timer = window.setTimeout(scroll, 120)
    window.addEventListener('resize', scroll)
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', scroll) }
  }, [page])
  const groups: NavGroup[] = pluginPages.length === 0 ? CORE_NAVIGATION : [...CORE_NAVIGATION, {
    label: t('nav.pluginsGroup'),
    items: pluginPages.map(entry => ({ id: entry.id, name: entry.title, icon: pageIcon(entry.icon) })),
  }]
  return <>
    <a className="console-brand" href="/" aria-label={t('nav.home')}>
      <img className="console-mark" src={brandMark} alt="" width={32} height={34} />
      <span>Our Free Model<small>{t('nav.subtitle')}</small></span>
    </a>
    <div className="workspace-switch"><span className="workspace-avatar"><ShieldCheck size={15} /></span>
      <span>{t('nav.personalWorkspace')}<small>{t('nav.standaloneService')}</small></span><Badge>{t('nav.localBadge')}</Badge>
    </div>
    <nav className="console-nav" aria-label={t('nav.management')} ref={navRef}>{groups.map(group => <div className="nav-group" key={group.label}>
      <span className="nav-group-label">{group.label}</span>
      {group.items.filter(item => item.id !== 'updates' || hasDesktopBridge()).map(item => <button key={item.id} id={item.id === 'sponsor' ? 'ofm-sponsor-menu-desktop' : undefined} className={`console-nav-item ${item.id === 'sponsor' ? 'ofm-sponsor-nav' : ''} ${page === item.id ? 'selected' : ''}`}
        aria-current={page === item.id ? 'page' : undefined} onClick={() => host.navigate(item.id)}>
        <span className="console-nav-indicator" aria-hidden="true" />
        <item.icon size={16} strokeWidth={1.7} /><span>{item.name}</span>
        {item.id === 'models' && <span className="count-badge">{summary?.catalog.length ?? '—'}</span>}
      </button>)}
    </div>)}</nav>
    <div className="sidebar-support"><ShieldCheck size={15} /><div><strong>{t('nav.localStorage')}</strong><p>{t('nav.localNote')}</p></div></div>
    <div className="console-sidebar-footer"><div title={t('nav.serviceOnline')}><span className="status-dot" /><span className="console-sidebar-state">{t('nav.serviceOnline')}</span><small>v{summary?.version ?? '—'}</small></div>
      <MotionToggle /><ThemeToggle /><LangToggle /><Button variant="ghost" aria-label={t('nav.logout')} title={t('nav.logout')} onClick={() => { void host.logout().catch(host.error) }}><LogOut size={15} /></Button></div>
    <button type="button" className="sidebar-disclaimer" onClick={onDisclaimer}>{t('nav.disclaimer')}</button>
  </>
}
export function Topbar({ page, summary, pluginPages = [] }: { page: Page; summary?: Summary; pluginPages?: PluginPage[] }) {
  return <><div className="console-breadcrumb"><span>{t('nav.workspace')}</span><ChevronRight size={13} /><strong key={page} className="console-breadcrumb-current">{pageLabel(page, pluginPages)}</strong></div>
    <div className="console-topbar-status"><span className="status-dot" /><span>{summary?.settings.enabled === false ? t('nav.paused') : t('nav.localService')}</span><span className="topbar-divider" /><span>LOCAL</span></div></>
}
