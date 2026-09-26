// SPDX-License-Identifier: GPL-3.0-only
// Picks the download that fits the visitor's computer before first paint.
// Without JavaScript both downloads show side by side, so nothing depends
// on this file; it only chooses which one leads. Phones, tablets, and
// Linux get both, with a line saying murmur is for Mac and Windows.
;(function () {
  var root = document.documentElement
  var ua = navigator.userAgent || ''
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
  // iPads report a Mac platform; touch points tell them apart.
  var touch = navigator.maxTouchPoints > 1
  var os = 'other'
  if (/win/i.test(platform) || /Windows NT/.test(ua)) os = 'windows'
  else if (/mac/i.test(platform) && !touch && !/iPhone|iPad|iPod/.test(ua)) os = 'mac'
  root.setAttribute('data-os', os)

  // "Also for Windows" and "Also for Mac" swap which download leads, so
  // the Windows note arrives with the Windows button.
  document.addEventListener('click', function (event) {
    var link = event.target.closest ? event.target.closest('[data-switch]') : null
    if (!link) return
    event.preventDefault()
    var next = link.getAttribute('data-switch')
    root.setAttribute('data-os', next)
    var button = document.querySelector('.dl-' + next + ' .btn')
    if (button) button.focus()
  })
})()
