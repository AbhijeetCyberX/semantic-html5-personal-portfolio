class ImageSlider {
    static DEFAULTS = {
        speed: 500,
        autoplay: false,
        interval: 4000,
        swipeThreshold: 50,
        pauseOnHover: true,
        pauseOnFocus: true,
        respectReducedMotion: true
    };

    constructor(target, options = {}) {
        this.root = typeof target === "string" ? document.querySelector(target) : target;

        if (!this.root) {
            throw new Error(`ImageSlider: slider element "${target}" was not found.`);
        }

        this.options = {...ImageSlider.DEFAULTS, ...options };

        this.options.speed = Math.max(0, Number(this.options.speed) || 0);
        this.options.interval = Math.max(250, Number(this.options.interval) || 4000);
        this.options.swipeThreshold = Math.max(0, Number(this.options.swipeThreshold) || 50);

        this.originalImages = Array.from(this.root.querySelectorAll(":scope > img"));
        this.total = this.originalImages.length;

        this.index = 0;
        this.position = 1;
        this.isAnimating = false;
        this.isDestroyed = false;

        this.timer = null;
        this.fallback = null;
        this.touchStartX = null;
        this.pointerId = null;

        this.abortController = new AbortController();
        this.listeners = this.abortController.signal;

        this.motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

        this.originalAttributes = {
            role: this.root.getAttribute("role"),
            ariaLabel: this.root.getAttribute("aria-label"),
            ariaRoleDescription: this.root.getAttribute("aria-roledescription"),
            tabIndex: this.root.getAttribute("tabindex")
        };

        this.originalSpeed = this.root.style.getPropertyValue("--slider-speed");
        this.originalSpeedPriority = this.root.style.getPropertyPriority("--slider-speed");

        if (this.total === 0) return;

        this.#build();
        this.#bindEvents();
        this.#render(false);

        if (this.options.autoplay) {
            this.#startAutoplay();
        }
    }

    #
    build() {
        this.root.setAttribute("role", "region");
        this.root.setAttribute("aria-roledescription", "carousel");

        if (!this.root.hasAttribute("aria-label")) {
            this.root.setAttribute("aria-label", "Image slider");
        }

        this.root.tabIndex = 0;
        this.root.style.setProperty("--slider-speed", `${this.#getSpeed()}ms`);

        this.track = document.createElement("div");
        this.track.className = "slider__track";

        this.slides = this.originalImages.map((image, i) => {
            const slide = document.createElement("div");
            slide.className = "slider__slide";
            slide.setAttribute("role", "group");
            slide.setAttribute("aria-label", `Slide ${i + 1} of ${this.total}`);
            slide.appendChild(image);
            return slide;
        });

        if (this.total > 1) {
            this.lastClone = this.slides[this.total - 1].cloneNode(true);
            this.firstClone = this.slides[0].cloneNode(true);

            this.lastClone.setAttribute("aria-hidden", "true");
            this.firstClone.setAttribute("aria-hidden", "true");

            this.#disableCloneInteraction(this.lastClone);
            this.#disableCloneInteraction(this.firstClone);

            this.track.append(this.lastClone, ...this.slides, this.firstClone);
        } else {
            this.track.append(...this.slides);
        }

        this.root.replaceChildren(this.track);

        if (this.total < 2) {
            this.root.classList.add("slider--single");
            return;
        }

        this.root.classList.remove("slider--single");

        this.prevBtn = this.#createButton("slider__arrow slider__arrow--prev", "Previous slide", "\u2039");
        this.nextBtn = this.#createButton("slider__arrow slider__arrow--next", "Next slide", "\u203A");

        this.dotsWrap = document.createElement("div");
        this.dotsWrap.className = "slider__dots";
        this.dotsWrap.setAttribute("role", "group");
        this.dotsWrap.setAttribute("aria-label", "Choose a slide");

        this.dots = this.slides.map((_, i) => {
            const dot = this.#createButton("slider__dot", `Go to slide ${i + 1}`, "");
            dot.dataset.index = String(i);
            this.dotsWrap.appendChild(dot);
            return dot;
        });

        this.status = document.createElement("span");
        this.status.className = "slider__status";
        this.status.setAttribute("role", "status");
        this.status.setAttribute("aria-live", "polite");
        this.status.setAttribute("aria-atomic", "true");

        this.root.append(this.prevBtn, this.nextBtn, this.dotsWrap, this.status);
    }

    #
    disableCloneInteraction(clone) {
        clone.querySelectorAll("a, button, input, select, textarea, [tabindex]").forEach(element => {
            element.setAttribute("tabindex", "-1");
        });
    }

    #
    createButton(className, label, text) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.setAttribute("aria-label", label);
        button.textContent = text;
        return button;
    }

    #
    bindEvents() {
        if (this.total < 2) return;
        const signal = this.listeners;

        this.prevBtn.addEventListener("click", () => this.prev(), { signal });
        this.nextBtn.addEventListener("click", () => this.next(), { signal });

        this.dotsWrap.addEventListener("click", event => {
            const dot = event.target.closest(".slider__dot");
            if (!dot || !this.dotsWrap.contains(dot)) return;
            this.goTo(Number(dot.dataset.index));
        }, { signal });

        this.track.addEventListener("transitionend", event => {
            if (event.target === this.track && event.propertyName === "transform") {
                this.#finish();
            }
        }, { signal });

        this.root.addEventListener("keydown", event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === "ArrowRight") {
                event.preventDefault();
                this.next();
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                this.prev();
            }
        }, { signal });

        this.root.addEventListener("pointerdown", event => {
            if (event.target.closest("button") || event.button !== 0) return;
            this.touchStartX = event.clientX;
            this.pointerId = event.pointerId;
        }, { signal });

        this.root.addEventListener("pointerup", event => {
            if (this.touchStartX === null || event.pointerId !== this.pointerId) return;
            const distance = event.clientX - this.touchStartX;
            this.touchStartX = null;
            this.pointerId = null;

            if (Math.abs(distance) < this.options.swipeThreshold) return;
            if (distance < 0) this.next();
            else this.prev();
        }, { signal });

        const resetPointer = () => {
            this.touchStartX = null;
            this.pointerId = null;
        };

        this.root.addEventListener("pointercancel", resetPointer, { signal });
        this.root.addEventListener("pointerleave", resetPointer, { signal });

        if (this.options.pauseOnHover) {
            this.root.addEventListener("mouseenter", () => this.#pauseAutoplay("hover"), { signal });
            this.root.addEventListener("mouseleave", () => this.#resumeAutoplay("hover"), { signal });
        }

        if (this.options.pauseOnFocus) {
            this.root.addEventListener("focusin", () => this.#pauseAutoplay("focus"), { signal });
            this.root.addEventListener("focusout", event => {
                if (!this.root.contains(event.relatedTarget)) {
                    this.#resumeAutoplay("focus");
                }
            }, { signal });
        }

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.#pauseAutoplay("hidden");
            else this.#resumeAutoplay("hidden");
        }, { signal });
    }

    next() {
        if (this.#isBlocked()) return;
        const atEnd = this.index === this.total - 1;
        this.#move(atEnd ? this.total + 1 : this.position + 1, atEnd ? 0 : this.index + 1);
    }

    prev() {
        if (this.#isBlocked()) return;
        const atStart = this.index === 0;
        this.#move(atStart ? 0 : this.position - 1, atStart ? this.total - 1 : this.index - 1);
    }

    goTo(target) {
        if (this.#isBlocked() || !Number.isInteger(target) || target < 0 || target >= this.total || target === this.index) {
            return;
        }
        this.#move(target + 1, target);
    }

    start() {
        if (this.isDestroyed || this.total < 2) return;
        this.options.autoplay = true;
        this.#startAutoplay();
    }

    stop() {
        this.options.autoplay = false;
        this.#stopAutoplay();
    }

    #
    isBlocked() {
        return (this.isDestroyed || this.total < 2 || this.isAnimating);
    }

    #
    move(position, index) {
        this.isAnimating = true;
        this.position = position;
        this.index = index;
        this.#render(true);

        clearTimeout(this.fallback);
        this.fallback = setTimeout(() => this.#finish(), this.#getSpeed() + 150);
    }

    #
    finish() {
        if (!this.isAnimating || this.isDestroyed) return;
        clearTimeout(this.fallback);

        if (this.position === this.total + 1) {
            this.position = 1;
        } else if (this.position === 0) {
            this.position = this.total;
        }

        this.#render(false);
        this.isAnimating = false;
    }

    #
    render(animate) {
        if (!this.track || this.isDestroyed) return;

        this.track.classList.toggle("no-transition", !animate || this.#reducedMotion());
        this.track.style.transform = `translateX(${-this.position * 100}%)`;

        if (!animate || this.#reducedMotion()) {
            void this.track.offsetWidth;
        }

        this.dots ? .forEach((dot, i) => {
            const active = i === this.index;
            dot.classList.toggle("is-active", active);
            if (active) dot.setAttribute("aria-current", "true");
            else dot.removeAttribute("aria-current");
        });

        if (this.status) {
            this.status.textContent = `Slide ${this.index + 1} of ${this.total}`;
        }
    }

    #
    getSpeed() {
        if (this.options.respectReducedMotion && this.#reducedMotion()) return 0;
        return this.options.speed;
    }

    #
    reducedMotion() {
        return Boolean(this.options.respectReducedMotion && this.motionQuery && this.motionQuery.matches);
    }

    #
    pauseAutoplay(reason) {
        this.pauseReasons ? ? = new Set();
        this.pauseReasons.add(reason);
        this.#stopAutoplay();
    }

    #
    resumeAutoplay(reason) {
        this.pauseReasons ? ? = new Set();
        this.pauseReasons.delete(reason);
        if (this.pauseReasons.size === 0) {
            this.#startAutoplay();
        }
    }

    #
    startAutoplay() {
        this.#stopAutoplay();
        if (this.isDestroyed || !this.options.autoplay || this.total < 2 || document.hidden || (this.pauseReasons && this.pauseReasons.size > 0)) {
            return;
        }
        this.timer = setInterval(() => {
            if (!this.isAnimating) {
                this.next();
            }
        }, this.options.interval);
    }

    #
    stopAutoplay() {
        clearInterval(this.timer);
        this.timer = null;
    }
}

// Automatically initialize the slider with 3-second autoplay enabled
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.myPortfolioSlider = new ImageSlider('#sliderContainer', {
            autoplay: true,
            interval: 3000,
            speed: 500
        });
    } catch (e) {
        console.error("Slider initialization error:", e);
    }
});