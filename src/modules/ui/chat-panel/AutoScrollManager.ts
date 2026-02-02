/**
 * AutoScrollManager - Intelligent auto-scroll management for chat panel
 * Handles smooth scrolling during streaming output with user interaction detection
 */

export interface AutoScrollManagerOptions {
  container: HTMLElement;
  scrollThreshold?: number; // Pixels from bottom to consider "at bottom"
  smoothScrollThreshold?: number; // Content height threshold for smooth vs instant scroll
}

export class AutoScrollManager {
  private container: HTMLElement;
  private scrollThreshold: number;
  private smoothScrollThreshold: number;

  // State tracking
  private isUserScrolling = false;
  private _isStreaming = false;
  private scrollTimeout: number | null = null;
  private rafId: number | null = null;
  private lastScrollTop = 0;
  private lastContentHeight = 0;

  // Performance optimization
  private scrollDebounceMs = 150;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: AutoScrollManagerOptions) {
    this.container = options.container;
    this.scrollThreshold = options.scrollThreshold ?? 50;
    this.smoothScrollThreshold = options.smoothScrollThreshold ?? 1000;

    this.setupEventListeners();
    this.setupResizeObserver();
  }

  /**
   * Setup scroll event listeners for user interaction detection
   */
  private setupEventListeners(): void {
    // Listen for user scroll events
    this.container.addEventListener(
      "scroll",
      this.handleUserScroll.bind(this),
      { passive: true },
    );

    // Also listen for wheel events to detect active scrolling
    this.container.addEventListener("wheel", this.handleWheelEvent.bind(this), {
      passive: true,
    });

    // Touch events for mobile/tablet
    this.container.addEventListener(
      "touchstart",
      this.handleTouchStart.bind(this),
      { passive: true },
    );

    this.container.addEventListener(
      "touchend",
      this.handleTouchEnd.bind(this),
      { passive: true },
    );
  }

  /**
   * Setup ResizeObserver to detect content changes
   */
  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          if (newHeight !== this.lastContentHeight) {
            this.lastContentHeight = newHeight;
            if (this._isStreaming) {
              this.handleContentChange();
            }
          }
        }
      });
      this.resizeObserver.observe(this.container);
    }
  }

  /**
   * Handle user scroll events
   */
  private handleUserScroll(): void {
    // Clear existing timeout
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }

    // Mark as user scrolling
    this.isUserScrolling = true;

    // Debounce scroll end detection
    this.scrollTimeout = window.setTimeout(() => {
      this.isUserScrolling = false;
      this.lastScrollTop = this.container.scrollTop;
    }, this.scrollDebounceMs);

    // Check if user scrolled to bottom
    if (this.isNearBottom() && this._isStreaming) {
      this.isUserScrolling = false;
    }
  }

  /**
   * Handle wheel events
   */
  private handleWheelEvent(e: WheelEvent): void {
    // If scrolling up, definitely user-initiated
    if (e.deltaY < 0) {
      this.isUserScrolling = true;
      if (this.scrollTimeout) {
        window.clearTimeout(this.scrollTimeout);
      }
      this.scrollTimeout = window.setTimeout(() => {
        this.isUserScrolling = false;
      }, this.scrollDebounceMs);
    }
  }

  /**
   * Handle touch start
   */
  private handleTouchStart(): void {
    this.isUserScrolling = true;
  }

  /**
   * Handle touch end
   */
  private handleTouchEnd(): void {
    // Delay clearing to allow momentum scroll to finish
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }
    this.scrollTimeout = window.setTimeout(() => {
      this.isUserScrolling = false;
      this.lastScrollTop = this.container.scrollTop;
    }, this.scrollDebounceMs);
  }

  /**
   * Check if container is near bottom
   */
  private isNearBottom(): boolean {
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= this.scrollThreshold;
  }

  /**
   * Handle content height changes during streaming
   */
  private handleContentChange(): void {
    if (!this._isStreaming || this.isUserScrolling) {
      return;
    }

    // Only auto-scroll if user was already near bottom
    if (this.isNearBottom()) {
      this.performSmoothScroll();
    }
  }

  /**
   * Perform smooth scroll to bottom
   */
  private performSmoothScroll(): void {
    // Cancel any pending animation frame
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    const targetScrollTop =
      this.container.scrollHeight - this.container.clientHeight;

    // Use smooth scrolling for small changes, instant for large
    const scrollDiff = Math.abs(targetScrollTop - this.container.scrollTop);

    if (scrollDiff < this.smoothScrollThreshold) {
      // Use native smooth scroll
      this.container.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });
    } else {
      // For large jumps, use animation frame for smoother experience
      this.animateScroll(targetScrollTop);
    }
  }

  /**
   * Animate scroll using requestAnimationFrame
   */
  private animateScroll(targetTop: number): void {
    const startTop = this.container.scrollTop;
    const diff = targetTop - startTop;
    const duration = 300; // ms
    const startTime = performance.now();

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function: easeOutCubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      this.container.scrollTop = startTop + diff * easeProgress;

      if (progress < 1 && this._isStreaming && !this.isUserScrolling) {
        this.rafId = requestAnimationFrame(step);
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  /**
   * Start streaming mode - enables auto-scroll
   */
  startStreaming(): void {
    this._isStreaming = true;
    this.isUserScrolling = false;

    // Initial scroll to bottom
    this.scrollToBottom(true);
  }

  /**
   * Stop streaming mode - disables auto-scroll
   */
  stopStreaming(): void {
    this._isStreaming = false;

    // Cancel any pending animation
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Scroll to bottom immediately or smoothly
   */
  scrollToBottom(instant = false): void {
    const targetScrollTop =
      this.container.scrollHeight - this.container.clientHeight;

    if (instant) {
      this.container.scrollTop = targetScrollTop;
    } else {
      this.container.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });
    }
  }

  /**
   * Check if auto-scroll is currently active
   */
  isAutoScrolling(): boolean {
    return this._isStreaming && !this.isUserScrolling;
  }

  /**
   * Get streaming state
   */
  getStreaming(): boolean {
    return this._isStreaming;
  }

  /**
   * Check if user is currently scrolling
   */
  isUserInteracting(): boolean {
    return this.isUserScrolling;
  }

  /**
   * Force enable auto-scroll (called when user scrolls to bottom)
   */
  enableAutoScroll(): void {
    this.isUserScrolling = false;
    if (this._isStreaming) {
      this.scrollToBottom();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Cancel animation frame
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    // Clear timeout
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }

    // Disconnect resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Remove event listeners is not needed as the container will be destroyed
  }
}

// Global scroll manager instances map (for sidebar and floating window)
const scrollManagers = new Map<HTMLElement, AutoScrollManager>();

/**
 * Get or create scroll manager for a container
 */
export function getScrollManager(
  container: HTMLElement,
): AutoScrollManager | null {
  if (!container) return null;

  if (!scrollManagers.has(container)) {
    const manager = new AutoScrollManager({
      container,
      scrollThreshold: 80,
      smoothScrollThreshold: 1500,
    });
    scrollManagers.set(container, manager);
  }

  return scrollManagers.get(container)!;
}

/**
 * Remove scroll manager for a container
 */
export function removeScrollManager(container: HTMLElement): void {
  const manager = scrollManagers.get(container);
  if (manager) {
    manager.destroy();
    scrollManagers.delete(container);
  }
}

/**
 * Start streaming for a container
 */
export function startStreamingScroll(container: HTMLElement): void {
  const manager = getScrollManager(container);
  manager?.startStreaming();
}

/**
 * Stop streaming for a container
 */
export function stopStreamingScroll(container: HTMLElement): void {
  const manager = getScrollManager(container);
  manager?.stopStreaming();
}

/**
 * Scroll to bottom for a container
 */
export function scrollToBottom(container: HTMLElement, instant = false): void {
  const manager = getScrollManager(container);
  if (manager) {
    manager.scrollToBottom(instant);
  } else {
    // Fallback to native scroll
    container.scrollTop = container.scrollHeight - container.clientHeight;
  }
}
