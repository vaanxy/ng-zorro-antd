import { Platform } from '@angular/cdk/platform';
import { DOCUMENT } from '@angular/common';
import {
  AfterContentInit,
  Component,
  ElementRef,
  HostListener,
  Inject,
  NgZone,
  OnInit,
  Renderer2,
  ViewChild
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { en_US, NzI18nService, zh_CN } from 'ng-zorro-antd/i18n';
import { NzMessageService } from 'ng-zorro-antd/message';
import { VERSION } from 'ng-zorro-antd/version';
import { fromEvent } from 'rxjs';
import { debounceTime, map, startWith } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { AppService } from './app.service';
import { ROUTER_LIST } from './router';

// tslint:disable-next-line:no-any
declare const docsearch: any;

interface DocPageMeta {
  path: string;
  label: string;
  order?: number;
  zh: string;
}

type SiteTheme = 'default' | 'dark';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterContentInit {

  /**
   * When the screen size is smaller that 768 pixel, show the drawer and hide
   * the navigation on the side.
   **/
  showDrawer = false;
  isDrawerOpen = false;
  page: 'docs' | 'components' | 'experimental' | string = 'docs'
  windowWidth = 1400;
  routerList = ROUTER_LIST;
  componentList: DocPageMeta[] = [];
  searchComponent = null;
  // tslint:disable-next-line:no-any
  docsearch: any = null;
  theme: SiteTheme = 'default';

  get useDocsearch(): boolean {
    if (!this.platform.isBrowser) {
      return false;
    }
    return window && window.location.href.indexOf('/version') === -1;
  }

  language = 'zh';
  oldVersionList = ['0.5.x', '0.6.x', '0.7.x', '1.8.x', '7.5.x'];
  currentVersion = VERSION.full;

  @ViewChild('searchInput', { static: false }) searchInput: ElementRef<HTMLInputElement>;

  switchLanguage(language: string): void {
    const url = this.router.url.split('/');
    url.splice(-1);
    // tslint:disable-next-line:prefer-template
    this.router.navigateByUrl(url.join('/') + '/' + language);
  }

  initTheme(): void {
    if (!this.platform.isBrowser) {
      return;
    }
    const theme = localStorage.getItem('site-theme') as SiteTheme || 'default';
    this.onThemeChange(theme);
  }

  onThemeChange(theme: SiteTheme): void {
    if (!this.platform.isBrowser) {
      return;
    }
    this.theme = theme;
    this.appService.theme$.next(theme);
    this.renderer.setAttribute(document.body, 'data-theme', theme)
    if (theme !== 'dark') {
      const dom = document.getElementById('dark-theme');
      if (dom) {
        dom.remove();
      }
      localStorage.removeItem('site-theme');
    } else {
      const style = document.createElement('link');
      style.type = 'text/css';
      style.rel = 'stylesheet';
      style.id = 'dark-theme';
      style.href = '/assets/dark.css';

      localStorage.setItem('site-theme', 'dark');
      document.body.append(style);
    }
  }

  constructor(
    private appService: AppService,
    private router: Router,
    private title: Title,
    private nzI18nService: NzI18nService,
    private msg: NzMessageService,
    private ngZone: NgZone,
    private platform: Platform,
    private meta: Meta,
    private renderer: Renderer2,
    // tslint:disable-next-line:no-any
    @Inject(DOCUMENT) private document: any
  ) {}

  navigateToPage(url: string): void {
    if (url) {
      this.router.navigateByUrl(url);
    }
  }

  setPage(url: string): void {
    const match = url.match(/\/(\w+)/);
    if (match && match[1]) {
      this.page = match[1];
    }
  }

  navigateToVersion(version: string): void {
    if (!this.platform.isBrowser) {
      return;
    }
    if (version !== this.currentVersion) {
      window.location.href = window.location.origin + `/version/` + version;
    } else {
      window.location.href = window.location.origin;
    }
    this.currentVersion = version;
  }

  ngOnInit(): void {
    this.routerList.components.forEach(group => {
      this.componentList = this.componentList.concat([...group.children]);
    });

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        const currentDemoComponent = this.componentList.find(component => `/${component.path}` === this.router.url);

        if (currentDemoComponent) {
          this.title.setTitle(`${currentDemoComponent.zh} ${currentDemoComponent.label} - NG-ZORRO`);
        }

        const currentIntroComponent = this.routerList.intro.find(component => `/${component.path}` === this.router.url);
        if (currentIntroComponent) {
          this.title.setTitle(`${currentIntroComponent.label} - NG-ZORRO`);
        }

        if (this.router.url !== '/' + this.searchComponent) {
          this.searchComponent = null;
        }
        this.setPage(this.router.url);
        this.language = this.router.url
        .split('/')
          [this.router.url.split('/').length - 1].split('#')[0]
        .split('?')[0];
        this.appService.language$.next(this.language);
        this.nzI18nService.setLocale(this.language === 'en' ? en_US : zh_CN);
        this.updateDocMetaAndLocale();
        if (this.docsearch) {
          this.docsearch!.algoliaOptions = { hitsPerPage: 5, facetFilters: [`tags:${this.language}`] };
        }

        if (environment.production && this.platform.isBrowser) {
          window.scrollTo(0, 0);
        }

        setTimeout(() => {
          const toc = this.router.parseUrl(this.router.url).fragment || '';
          if (toc) {
            if (this.platform.isBrowser) {
              document.querySelector(`#${toc}`)!.scrollIntoView();
            }
          }
        }, 200);
      }
    });

    this.initColor();
    this.initTheme();
    this.detectLanguage();
  }

  ngAfterContentInit(): void {
    if (this.useDocsearch) {
      this.initDocsearch();
    }

    this.addWindowWidthListener();
  }

  updateDocMetaAndLocale(): void {
    if (this.platform.isBrowser) {
      const isEn = this.language === 'en';
      const enDescription =
        'An enterprise-class UI design language and Angular-based implementation with a set of high-quality Angular components, one of best Angular UI library for enterprises';
      const zhDescription = 'Ant Design 的 Angular 实现，开发和服务于企业级后台产品，开箱即用的高质量 Angular 组件。';
      const descriptionContent = isEn ? enDescription : zhDescription;
      this.meta.updateTag({
        name: 'description',
        content: descriptionContent
      });
      this.meta.updateTag({
        name: 'twitter:description',
        content: descriptionContent
      });
      this.meta.updateTag({
        property: 'og:description',
        content: descriptionContent
      });
      this.meta.updateTag({
        property: 'og:locale',
        content: isEn ? 'en_US' : 'zh_CN'
      });
      const doc = this.document as Document;
      this.renderer.setAttribute(doc.documentElement, 'lang', isEn ? 'en' : 'zh-Hans');
    }
  }

  initDocsearch() {
    this.loadScript('https://cdn.jsdelivr.net/npm/docsearch.js@2/dist/cdn/docsearch.min.js').then(() => {
      this.docsearch = docsearch({
        appId: 'BH4D9OD16A',
        apiKey: '9f7d9d6527ff52ec484e90bb1f256971',
        indexName: 'ng_zorro',
        inputSelector: '#search-box input',
        algoliaOptions: { hitsPerPage: 5, facetFilters: [`tags:${this.language}`] },
        transformData(hits: any) {
          // tslint:disable-line:no-any
          hits.forEach((hit: any) => {
            // tslint:disable-line:no-any
            hit.url = hit.url.replace('ng.ant.design', location.host);
            hit.url = hit.url.replace('https:', location.protocol);
          });
          return hits;
        },
        debug: false
      });
    });
  }

  @HostListener('document:keyup.s', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (this.useDocsearch && this.searchInput && this.searchInput.nativeElement && event.target === document.body) {
      this.searchInput.nativeElement.focus();
    }
  }

  // region: color
  color = `#1890ff`;

  initColor() {
    if (!this.platform.isBrowser) {
      return;
    }
    const node = document.createElement('link');
    node.rel = 'stylesheet/less';
    node.type = 'text/css';
    node.href = '/assets/color.less';
    document.getElementsByTagName('head')[0].appendChild(node);
  }

  lessLoaded = false;

  changeColor(res: any) {
    if (!this.platform.isBrowser) {
      return;
    }
    const changeColor = () => {
      (window as any).less
      .modifyVars({
        '@primary-color': res.color.hex
      })
      .then(() => {
        this.msg.success(`应用成功`);
        this.color = res.color.hex;
        window.scrollTo(0, 0);
      });
    };

    const lessUrl = 'https://cdnjs.cloudflare.com/ajax/libs/less.js/2.7.2/less.min.js';

    if (this.lessLoaded) {
      changeColor();
    } else {
      (window as any).less = {
        async: true
      };
      this.loadScript(lessUrl).then(() => {
        this.lessLoaded = true;
        changeColor();
      });
    }
  }

  loadScript(src: string) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head!.appendChild(script);
    });
  }

  // endregion
  private addWindowWidthListener(): void {
    if (!this.platform.isBrowser) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      fromEvent(window, 'resize')
      .pipe(
        startWith(true),
        debounceTime(50),
        map(() => window.innerWidth)
      )
      .subscribe(width => {
        this.windowWidth = width;
        const showDrawer = width <= 768;
        if (this.showDrawer !== showDrawer) {
          this.showDrawer = showDrawer;
        }
      });
    });
  }

  private detectLanguage(): void {
    if (!this.platform.isBrowser) {
      return;
    }
    const language = navigator.language.toLowerCase();
    const pathname = location.pathname;
    const hasLanguage = pathname.match(/(en|zh)(\/?)$/);
    if (language === 'zh-cn' && !hasLanguage) {
      this.nzI18nService.setLocale(zh_CN);
      this.router.navigate(['docs', 'introduce', 'zh']);
    }
  }
}
