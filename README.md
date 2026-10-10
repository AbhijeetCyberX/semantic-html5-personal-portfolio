Files
·	index.html - demo page with two slider instances
·	style.css - viewport mask, flex track, controls, breakpoints
·	slider.js - ImageSlider ES6 class
·	images/ - sample slides (replace with your own)
Usage
<div class="slider" id="demo"><img src="a.jpg" alt=""><img src="b.jpg" alt=""></div>
<script src="slider.js"></script>
<script>new ImageSlider('#demo', { speed: 500, autoplay: false });</script>

Features
Next/Previous arrows, clickable indicator dots, translateX sliding, seamless looping in both directions (clone slides), keyboard + swipe support, ARIA labels, reduced-motion support.
Run
Open index.html in any modern browser.
