import { LoadStatus } from '@ulixee/hero-interfaces/Location';
import { IFrameNavigationEvents } from '@ulixee/hero-core/lib/FrameNavigations';
import { ContentPaint } from '@ulixee/hero-interfaces/INavigation';
import { Session, Tab } from '@ulixee/hero-core';
import { bindFunctions } from '@ulixee/commons/lib/utils';
import { TypedEventEmitter } from '@ulixee/commons/lib/eventUtils';

export default class TimelineRecorder extends TypedEventEmitter<{
  updated: void;
}> {
  public recordScreenUntilTime = 0;
  public recordScreenUntilLoad = false;
  private isPaused = false;

  constructor(readonly heroSession: Session) {
    super();
    bindFunctions(this);

    heroSession.on('tab-created', this.onTabCreated);
    heroSession.on('kept-alive', this.onHeroSessionPaused);
    heroSession.on('resumed', this.onHeroSessionResumed);
    heroSession.on('will-close', this.onHeroSessionWillClose);

    heroSession.db.screenshots.subscribe(() => this.emit('updated'));
    heroSession.once('closed', () => {
      heroSession.off('tab-created', this.onTabCreated);
      heroSession.db.screenshots.unsubscribe();
    });
  }

  public stop(): void {
    if (!this.heroSession) return;
    this.heroSession.off('tab-created', this.onTabCreated);
    this.heroSession.off('kept-alive', this.onHeroSessionPaused);
    this.heroSession.off('resumed', this.onHeroSessionResumed);
    this.heroSession.on('will-close', this.onHeroSessionWillClose);
    this.stopRecording();
  }

  public stopRecording(): void {
    for (const tab of this.heroSession.tabsById.values()) {
      tab
        .stopRecording()
        .then(() => this.emit('updated'))
        .catch(console.error);
    }
  }

  public getScreenshot(tabId: number, timestamp: number): string {
    const image = this.heroSession.db.screenshots.getImage(tabId, timestamp);
    if (image) return image.toString('base64');
  }

  private onHeroSessionResumed(): void {
    this.isPaused = false;
    if (!this.heroSession) return;

    for (const tab of this.heroSession.tabsById.values()) {
      this.recordTab(tab);
    }
  }

  private onHeroSessionWillClose(event: { waitForPromise?: Promise<any> }): void {
    if (!this.recordScreenUntilTime && !this.recordScreenUntilLoad) return;
    let loadPromise: Promise<any>;
    if (this.recordScreenUntilLoad && this.heroSession) {
      loadPromise = Promise.all(
        [...this.heroSession.tabsById.values()].map(x => {
          return x.navigationsObserver.waitForLoad(LoadStatus.AllContentLoaded);
        }),
      );
    }

    const delay = this.recordScreenUntilTime - Date.now();
    let delayPromise: Promise<void>;
    if (delay > 0) {
      delayPromise = new Promise<void>(resolve => setTimeout(resolve, delay));
    }
    if (loadPromise || delayPromise) {
      event.waitForPromise = Promise.race([
        // max wait time
        new Promise<void>(resolve => setTimeout(resolve, 60e3)),
        Promise.all([loadPromise, delayPromise]),
      ]).catch(() => null);
    }
  }

  private onHeroSessionPaused(): void {
    this.isPaused = true;
    if (!this.heroSession) return;
    this.stopRecording();
  }

  private onTabCreated(event: { tab: Tab }): void {
    const tab = event.tab;
    tab.navigations.on('status-change', this.onStatusChange);
    tab.once('close', () => {
      tab.navigations.off('status-change', this.onStatusChange);
    });
    if (this.isPaused) return;

    this.recordTab(tab);
  }

  private recordTab(tab: Tab): void {
    tab
      .recordScreen({
        includeWhiteScreens: true,
        includeDuplicates: true,
        jpegQuality: 75,
        format: 'jpeg',
        imageSize: {
          height: 200,
        },
      })
      .catch(console.error);
  }

  private onStatusChange(status: IFrameNavigationEvents['status-change']): void {
    if (
      [LoadStatus.DomContentLoaded, LoadStatus.AllContentLoaded, ContentPaint].includes(
        status.newStatus,
      )
    ) {
      this.emit('updated');
    }
  }
}