import { useEffect, useRef, useState } from 'react'
import { providers } from 'ofm-provider-list'
import { Activity, ArrowRight, ArrowUpRight, Boxes, Check, CircleCheck, Copy, Handshake, Layers3, Network, RefreshCw, Terminal, Zap } from 'lucide-react'
import { Badge, Button, Card } from './ui'
import { t, numLocale } from '../i18n.mjs'
import '../usage.css'
import { useCountUp, useReveal, useSpotlight, useTilt } from '../motion/hooks'
import type { Host, Snapshot } from '../types'

const number = (value: number) => new Intl.NumberFormat(numLocale()).format(value)
const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : number(value)

/** 把一串数字压成一条通栏趋势带（viewBox 宽 100 高 26，preserveAspectRatio=none 拉伸）。 */
function sparkGeometry(values: number[]): { line: string; area: string } | undefined {
  if (values.length < 2 || values.every(value => value === 0)) return undefined
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100
    const y = 22 - (value / max) * 18
    return [x, y] as const
  })
  return {
    line: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    area: `0,26 ${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} 100,26`,
  }
}

/** 单张 KPI 卡：数字滚动 + 迷你趋势线 + 聚光灯。 */
function MetricCard({ name, value, detail, icon: Icon, trend }: {
  name: string; value: string; detail: string
  icon: typeof Boxes; trend: number[]
}) {
  const tilt = useTilt<HTMLDivElement>(4, 3)
  const spot = useSpotlight<HTMLDivElement>()
  const attach = (node: HTMLDivElement | null) => {
    tilt.current = node
    spot.current = node
  }
  const spark = sparkGeometry(trend)
  return <Card className="ov-metric m-tilt m-spot" ref={attach}>
    <div><span>{name}</span><div className="ov-metric-icon"><Icon size={15} /></div></div>
    <strong>{value}</strong><p>{detail}</p>
    {spark ? <svg className="ov-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={spark.area} /><polyline points={spark.line} />
    </svg> : null}
  </Card>
}

export function Overview({ summary, stats, host }: Snapshot & { host: Host }) {
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const routable = summary.catalog.filter(model => model.routable).length
  const totalTokens = stats.grand.input + stats.grand.output
  const turns = useCountUp(stats.turns)
  const recovered = useCountUp(stats.recoveredTurns)
  const tokens = useCountUp(totalTokens)
  const models = useCountUp(routable)

  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(today); at.setDate(at.getDate() - 6 + index)
    const id = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    return { id, value: stats.days.find(row => row.day === id)?.total ?? 0 }
  })
  const total = days.reduce((sum, row) => sum + row.value, 0)
  const max = Math.max(1, ...days.map(row => row.value))
  const failures = [...stats.samples].reverse().filter(row => row.ok === false).slice(0, 4)

  // 趋势带只给真正有逐日数据的两张卡（用户回合、累计 Token）。
  // 可接入模型与已恢复回合没有逐日历史——宁可不画，也不编造一条假曲线。
  const metricRows = [
    { name: t('ov.metricModels'), value: number(Math.round(models)), icon: Boxes, detail: t('ov.metricModelsDetail'), trend: [] },
    { name: t('ov.metricTurns'), value: number(Math.round(turns)), icon: Layers3, detail: t.format('ov.metricRequests', { n: number(stats.requests) }), trend: days.map(day => day.value) },
    { name: t('ov.metricTokens'), value: compact(Math.round(tokens)), icon: Zap, detail: t.format('ov.metricTokensDetail', { input: compact(stats.grand.input), output: compact(stats.grand.output) }), trend: days.map(day => day.value) },
    { name: t('ov.metricRecovered'), value: number(Math.round(recovered)), icon: Activity, detail: t.format('ov.metricRecoveredDetail', { n: number(stats.failedTurns) }), trend: [] },
  ]

  const sources = [
    { name: t('ov.sourceAnonymous'), sub: t('ov.sourceAnonymousSub'), icon: Zap, count: summary.catalog.filter(row => row.channel === 'anonymous' || row.channel === 'kilo').length, page: 'models' as const },
    { name: t('ov.sourceChannels'), sub: t.format('ov.sourceChannelsSub', { n: providers.length }), icon: Network, count: summary.catalog.filter(row => !['anonymous', 'kilo', 'eac'].includes(row.channel)).length, page: 'channels' as const },
    { name: t('ov.sourceEac'), sub: summary.eacAuth?.local ? t('ov.sourceEacSaved') : t('ov.sourceEacEmpty'), icon: Handshake, count: summary.catalog.filter(row => row.channel === 'eac').length, page: 'eac' as const },
  ]

  const reveal = useReveal<HTMLDivElement>(sources.length)
  const quickTilt = useTilt<HTMLDivElement>(3, 2)
  const quickSpot = useSpotlight<HTMLDivElement>()
  const attachQuick = (node: HTMLDivElement | null) => {
    quickTilt.current = node
    quickSpot.current = node
  }

  const copyEndpoint = () => {
    void host.copy(`${summary.baseUrl}/v1`).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    }).catch(host.error)
  }

  return <div className="dashboard" data-testid="overview-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / OVERVIEW</div><h1>{t('ov.heading')}</h1><p>{t('ov.sub')}</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => {
        setRefreshing(true); void host.refresh().catch(host.error).finally(() => setRefreshing(false))
      }}><RefreshCw size={14} className={refreshing ? 'spinning' : ''} />{refreshing ? t('ov.updating') : t('ov.update')}</Button></header>

    <div className="dashboard-metrics">{metricRows.map(metric => <MetricCard key={metric.name} {...metric} />)}</div>

    <div className="dashboard-main-grid">
      <Card className="ov-chart-panel">
        <div className="card-heading"><div><h2>{t('ov.chartTitle')}</h2><p>{t('ov.chartSub')}</p></div><Badge>{t('ov.chartBadge')}</Badge></div>
        <div className="ov-chart-total">{compact(total)} <span>Token</span></div>
        <div className="ov-chart" role="img" aria-label={t.format('ov.chartAria', { days: days.map(day => `${day.id} ${day.value}`).join('；') })}>
          <div className="chart-grid-lines"><span /><span /><span /><span /></div>
          {days.map(day => <div className="ov-chart-col" key={day.id} title={t.format('ov.dayTitle', { day: day.id, tokens: number(day.value) })}>
            <div className={`ov-chart-bar ${day.value === 0 ? 'zero' : ''}`} style={{ height: `${Math.max(2, day.value / max * 80)}%` }} />
            <span>{day.id.slice(5).replace('-', '/')}</span>
          </div>)}
          {total === 0 && <div className="ov-chart-empty"><Activity size={20} /><span>{t('ov.chartEmpty')}</span><small>{t('ov.chartEmptyHint')}</small></div>}
        </div>
        <div className="card-foot"><span>{t('ov.chartFoot')}</span><button onClick={() => host.navigate('usage')}>{t('ov.viewAllUsage')} <ArrowRight size={13} /></button></div>
      </Card>

      <Card className="ov-quick m-tilt m-spot" ref={attachQuick}>
        <div className="ov-quick-icon"><Terminal size={18} /></div>
        <h2>{t('nav.connection')}</h2><p>{t('ov.quickSub')}</p>
        <label>API BASE URL</label>
        <div className="ov-endpoint"><code>{summary.baseUrl}/v1</code>
          <Button variant="ghost" aria-label={t('ov.copyApiTitle')} onClick={copyEndpoint} title={t('ov.copyApiTitle')}
            className={copied ? 'ov-copied' : ''}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </Button>
        </div>
        {copied && <span className="copy-feedback" role="status">{t('ov.apiCopied')}</span>}
        <div className="connect-steps"><span>{t('ov.stepSession')}</span><span>{t('ov.stepAuth')}</span><span>{t('ov.stepBind')}</span></div>
        <Button className="connect-button" onClick={() => host.navigate('connection')}>{t('ov.viewConfig')} <ArrowUpRight size={15} /></Button>
        <div className="connection-footnote"><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? t('ov.serviceEnabled') : t('ov.servicePaused')}</div>
      </Card>
    </div>

    <div className="dashboard-bottom-grid">
      <Card className="ov-panel">
        <div className="card-heading"><div><h2>{t('ov.sourcesTitle')}</h2><p>{t('ov.sourcesSub')}</p></div><Network size={16} /></div>
        <div className="ov-source-list m-reveal" ref={reveal}>{sources.map((source, index) => <button className="ov-source-row" key={source.name} onClick={() => host.navigate(source.page)}
          style={{ '--i': index } as React.CSSProperties}>
          <span className="ov-source-icon"><source.icon size={16} /></span>
          <span><strong>{source.name}</strong><small>{source.sub}</small></span>
          <Badge>{t.format('ov.sourceModels', { n: source.count })}</Badge><ArrowRight size={13} />
        </button>)}</div>
      </Card>

      <Card className="ov-panel">
        <div className="card-heading"><div><h2>{t('ov.checkTitle')}</h2><p>{t('ov.checkSub')}</p></div>
          <Badge tone={failures.length ? 'warning' : 'success'}>{failures.length ? t('ov.checkFailures') : t('ov.checkClean')}</Badge></div>
        <div className="runtime-check"><CircleCheck size={16} /><span>{t('ov.checkModule')}</span><strong>{summary.channels.state === 'ready' ? t('ov.moduleReady') : summary.channels.state === 'failed' ? t('ov.moduleFailed') : t('ov.moduleInit')}</strong></div>
        <div className="runtime-check"><RefreshCw size={16} /><span>{t('ov.checkRefresh')}</span><strong>{summary.automaticRefresh ? t.format('ov.refreshEvery', { n: summary.settings.probeIntervalMinutes }) : t('ov.refreshPaused')}</strong></div>
        {failures.length ? <div className="ov-failure-list">{failures.map((row, index) =>
          <div key={`${row.at}-${index}`} className="ov-failure-row">
            <span>{row.model ?? t('ov.failureUnknownModel')}</span>
            <small>{t.format('ov.failureAt', { time: row.at ? new Date(row.at).toLocaleTimeString(numLocale()) : t('ov.timeUnknown') })}</small>
          </div>)}</div>
          : <div className="ov-runtime-empty"><CircleCheck size={16} /><span>{t('ov.failureEmpty')}</span></div>}
        <div className="card-foot"><span title={summary.dataDir}>{t('ov.dataFoot')}</span><button onClick={() => host.navigate('settings')}>{t('ov.openSettings')} <ArrowRight size={13} /></button></div>
      </Card>
    </div>
  </div>
}
