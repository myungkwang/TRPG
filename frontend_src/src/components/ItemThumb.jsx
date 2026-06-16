import React, { useEffect, useState } from 'react'
import { getItemThumb } from '../itemThumb.js'

// 작은 고정 아이템 아이콘 — 공용 렌더러가 만든 PNG를 <img>로 표시(컨텍스트 0개 점유).
export default function ItemThumb({ path, orient, fallback, className = '' }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    getItemThumb(path, orient).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path, orient])

  if (url) return <img className={className} src={url} alt="" draggable={false} />
  return <span className={`${className} thumb-fallback`}>{fallback}</span>
}
