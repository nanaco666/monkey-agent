#!/bin/bash
# A股关键水位监控 — 每日收盘后检查
# 关键水位：上证3900 / 深证14500
# 跌破发Telegram告警，未跌破发日报
# 周五额外发周总结

BOT_TOKEN="8773513607:AAFrhnf1Tw4Id67pIgmw0gHgeL8NhQ64adQ"
CHAT_ID="1759606047"
TG_API="https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"

# 关键水位
SH_BREAK=3900
SZ_BREAK=14500

# 获取指数数据
fetch_index() {
  local symbol=$1
  curl -s "https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d" \
    -H "User-Agent: Mozilla/5.0" | python3 -c "
import json,sys
d=json.load(sys.stdin)
result=d['chart']['result'][0]
quotes=result['indicators']['quote'][0]
closes=quotes['close']
ts=result['timestamp']
import datetime
valid=[(ts[i],closes[i]) for i in range(len(closes)) if closes[i]]
if not valid:
    print('ERROR')
    sys.exit(0)
current=valid[-1][1]
# RSI 14
if len(valid) > 14:
    deltas=[valid[i][1]-valid[i-1][1] for i in range(1,len(valid))]
    gains=[d for d in deltas[-14:] if d>0]
    losses=[-d for d in deltas[-14:] if d<0]
    avg_gain=sum(gains)/14 if gains else 0
    avg_loss=sum(losses)/14 if losses else 0.001
    rs=avg_gain/avg_loss
    rsi=round(100-100/(1+rs),1)
else:
    rsi='N/A'
# 近5日
recent5=valid[-5:] if len(valid)>=5 else valid
days_str=''
for t,c in recent5:
    days_str+=datetime.datetime.fromtimestamp(t).strftime('%m-%d')+': '+str(round(c,2))+'\n'
# 月初 vs 现在
month_start=None
for t,c in valid:
    dt=datetime.datetime.fromtimestamp(t)
    if dt.month==datetime.datetime.now().month:
        month_start=c
        break
month_chg=round((current/month_start-1)*100,1) if month_start else 'N/A'

print(f'{current}|{rsi}|{month_chg}|{days_str}')
"
}

# 上证
SH_DATA=$(fetch_index "000001.SS")
# 深证
SZ_DATA=$(fetch_index "399001.SZ")
# 沪深300
HS300_DATA=$(fetch_index "000300.SS")

SH_PRICE=$(echo "$SH_DATA" | cut -d'|' -f1)
SH_RSI=$(echo "$SH_DATA" | cut -d'|' -f2)
SH_MONTHCHG=$(echo "$SH_DATA" | cut -d'|' -f3)

SZ_PRICE=$(echo "$SZ_DATA" | cut -d'|' -f1)
SZ_RSI=$(echo "$SZ_DATA" | cut -d'|' -f2)
SZ_MONTHCHG=$(echo "$SZ_DATA" | cut -d'|' -f3)

HS300_PRICE=$(echo "$HS300_DATA" | cut -d'|' -f1)

WEEKDAY=$(date +%u)  # 1=Mon ... 5=Fri ... 7=Sun
TODAY=$(date '+%Y-%m-%d %H:%M')

# 判断是否跌破
SH_BROKEN=$(echo "$SH_PRICE < $SH_BREAK" | bc -l 2>/dev/null)
SZ_BROKEN=$(echo "$SZ_PRICE < $SZ_BREAK" | bc -l 2>/dev/null)

# 判断是否周五
IS_FRIDAY=0
if [ "$WEEKDAY" = "5" ]; then
    IS_FRIDAY=1
fi

# 构建消息
if [ "$SH_BROKEN" = "1" ] || [ "$SZ_BROKEN" = "1" ]; then
    # 跌破告警
    TITLE="🚨 A股水位告警"
    MSG="⚠️ 关键水位跌破\n\n"
    MSG+="上证指数: ${SH_PRICE}\n"
    MSG+="  水位线: ${SH_BREAK}  $([ "$SH_BROKEN" = "1" ] && echo '❌ 跌破' || echo '✅ 守住')\n"
    MSG+="  RSI: ${SH_RSI}  |  月跌: ${SH_MONTHCHG}%\n\n"
    MSG+="深证成指: ${SZ_PRICE}\n"
    MSG+="  水位线: ${SZ_BREAK}  $([ "$SZ_BROKEN" = "1" ] && echo '❌ 跌破' || echo '✅ 守住')\n"
    MSG+="  RSI: ${SZ_RSI}  |  月跌: ${SZ_MONTHCHG}%\n\n"
    MSG+="沪深300: ${HS300_PRICE}\n\n"
    MSG+="${TODAY}\n"
    MSG+="如连续3天站不回，性质可能转为中期调整"
else
    # 未跌破日报
    TITLE="📊 A股水位日报"
    MSG="✅ 关键水位守住\n\n"
    MSG+="上证指数: ${SH_PRICE} (水位${SH_BREAK})\n"
    MSG+="  RSI: ${SH_RSI}  |  月跌: ${SH_MONTHCHG}%\n\n"
    MSG+="深证成指: ${SZ_PRICE} (水位${SZ_BREAK})\n"
    MSG+="  RSI: ${SZ_RSI}  |  月跌: ${SZ_MONTHCHG}%\n\n"
    MSG+="沪深300: ${HS300_PRICE}\n\n"

    if [ "$IS_FRIDAY" = "1" ]; then
        MSG+="━━━━━━━━━━━━━━━\n"
        MSG+="📋 本周总结\n"
        MSG+="━━━━━━━━━━━━━━━\n"
        MSG+="周一7/7: 上证3990 / 深证15225\n"
        MSG+="分析基线: 深证14500 / 上证3900\n"
        MSG+="7月起始: 上证4112 / 深证16119\n"
        MSG+="7月至今: 上证${SH_MONTHCHG}% / 深证${SZ_MONTHCHG}%\n\n"
        MSG+="状态: $([ "$SH_BROKEN" = "1" ] || [ "$SZ_BROKEN" = "1" ] && echo '⚠️ 水位已破，需重新评估' || echo '✅ 洗盘区间内，耐心等企稳信号')\n"
        MSG+="观察点: 是否出现深跌后V型拉回+放量 = 洗盘结束信号\n"
    fi

    MSG+="${TODAY}"
fi

# 发送Telegram
curl -s -X POST "$TG_API" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=$(echo -e "$TITLE\n\n$MSG")" \
  -d "parse_mode=Markdown" > /dev/null 2>&1

echo "Sent: ${TITLE}"
