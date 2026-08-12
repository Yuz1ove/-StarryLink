(function initStarryLinkHomeHeroData(global) {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const data = {
    version: "route-study-14",
    study: {
      defaultMode: "routes",
    },
    content: {
      heroLabel: "星夜 StarryLink 路徑研究",
      signature: "星夜 急難救助分節系統",
      wordmark: {
        label: "StarryLink",
        starry: "Starry",
        link: "Link",
      },
      statement: "當地面沉默，求救訊號仍會被一站一站接住。",
      support: "海纜、地面站、無人機與衛星協同改道，直到應變中心回傳 ACK。",
      actions: {
        label: "品牌導覽",
        primary: "觀看訊號接力",
        secondary: "探索通訊架構",
      },
      relay: {
        nodes: {
          desktop: {
            origin: "基地台中繼",
            ground: "海纜節點",
            drone: "空中中繼",
            satellite: "衛星",
            center: "應變中心",
          },
          mobile: {
            origin: "基地台中繼",
            ground: "海纜節點",
            drone: "空中中繼",
            satellite: "衛星",
            center: "應變中心",
          },
        },
        delivery: "ACK · 已送達",
        status: {
          idle: "求救訊號正在等待可用路徑。",
          directAttempt: "SOS 正嘗試沿原路送往應變中心。",
          directBreak: "原路在途中中斷，訊號正在尋找替代路徑。",
          receive: "{node} 收到求救訊號。",
          originAlert: "{node} 偵測到災情，正在啟動緊急接力。",
          unavailable: "{node} 無法使用，流星正在改道前往下一個節點。",
          handoff: "{node} 承接後轉送至下一站。",
          centerReceive: "應變中心收到求救訊號。",
          delivered: "ACK，求救訊號已送達應變中心。",
          ackReturn: "ACK 正沿接力路徑返回求救端。",
          ackComplete: "ACK 已返回，通訊接力完成。",
          reduced: "求救訊號已經由地面中繼、無人機與衛星送達應變中心，ACK 已返回。",
          fallback: "原路中斷後，求救訊號會經由地面中繼、無人機與衛星接力送達應變中心，並收到返回的 ACK。",
        },
      },
    },
    routes: {
      sceneOrder: ["horizon"],
      original: {
        desktop: {
          paths: {
            directFuture: "M 676 568 C 820 546 976 526 1090 500",
            direct: "M 110 520 C 332 628 548 618 662 574",
            "origin-ground": "M 110 520 C 184 604 296 638 395 590",
            "ground-drone": "M 395 590 C 450 424 416 268 305 160",
            "drone-satellite": "M 305 160 C 520 70 758 82 900 150",
            "satellite-center": "M 900 150 C 1112 214 1148 376 1090 500",
          },
          breakPoint: [670, 571],
          nodes: { origin: [110, 520], ground: [395, 590], drone: [305, 160], satellite: [900, 150], center: [1090, 500] },
        },
        mobile: {
          paths: {
            directFuture: "M 609 620 C 650 606 692 580 720 550",
            direct: "M 480 575 C 520 625 565 650 595 625",
            "origin-ground": "M 480 575 C 520 620 560 642 605 625",
            "ground-drone": "M 605 625 C 575 485 535 330 485 195",
            "drone-satellite": "M 485 195 C 545 125 640 122 700 160",
            "satellite-center": "M 700 160 C 750 275 750 420 720 550",
          },
          breakPoint: [602, 623],
          nodes: { origin: [480, 575], ground: [605, 625], drone: [485, 195], satellite: [700, 160], center: [720, 550] },
        },
      },
      scenes: {
        horizon: {
          desktop: {
            paths: {
              directFuture: "M 630 542 C 820 510 1050 470 1240 430",
              direct: "M -40 530 C 190 624 440 624 610 548",
              "origin-ground": "M 95 610 C 175 640 280 635 360 585",
              "ground-drone": "M 360 585 C 420 454 466 328 520 220",
              "drone-satellite": "M 520 220 C 690 80 865 75 965 160",
              "satellite-center": "M 965 160 C 1120 230 1210 330 1240 430",
            },
            breakPoint: [620, 545],
            nodes: { origin: [95, 610], ground: [360, 585], drone: [520, 220], satellite: [965, 160], center: [1240, 430] },
          },
          mobile: {
            paths: {
              directFuture: "M 610 610 C 670 590 735 550 782 500",
              direct: "M 418 590 C 482 636 548 644 596 616",
              "origin-ground": "M 500 650 C 524 646 550 636 574 620",
              "ground-drone": "M 574 620 C 548 490 538 355 558 232",
              "drone-satellite": "M 558 232 C 604 150 668 136 716 180",
              "satellite-center": "M 716 180 C 776 270 798 390 782 500",
            },
            breakPoint: [602, 614],
            nodes: { origin: [500, 650], ground: [574, 620], drone: [558, 232], satellite: [716, 180], center: [782, 500] },
          },
        },
        diagonal: {
          desktop: {
            paths: {
              directFuture: "M 406 426 C 660 260 900 110 1120 -30",
              direct: "M 70 730 C 170 610 280 500 392 438",
              "origin-ground": "M 70 730 C 118 650 186 582 260 540",
              "ground-drone": "M 260 540 C 360 470 470 396 565 350",
              "drone-satellite": "M 565 350 C 668 286 770 214 860 170",
              "satellite-center": "M 860 170 C 960 100 1050 32 1120 -30",
            },
            breakPoint: [398, 432],
            nodes: { origin: [70, 730], ground: [260, 540], drone: [565, 350], satellite: [860, 170], center: [1120, -30] },
          },
          mobile: {
            paths: {
              directFuture: "M 604 430 C 650 340 704 235 760 120",
              direct: "M 430 700 C 480 610 532 520 592 446",
              "origin-ground": "M 430 700 C 474 624 514 566 548 532",
              "ground-drone": "M 548 532 C 580 480 612 426 636 380",
              "drone-satellite": "M 636 380 C 666 326 700 266 724 218",
              "satellite-center": "M 724 218 C 744 174 754 142 760 120",
            },
            breakPoint: [598, 438],
            nodes: { origin: [430, 700], ground: [548, 532], drone: [636, 380], satellite: [724, 218], center: [760, 120] },
          },
        },
        slingshot: {
          desktop: {
            paths: {
              directFuture: "M 748 602 C 520 638 220 570 -40 420",
              direct: "M 1240 590 C 1090 632 920 638 770 606",
              "origin-ground": "M 1240 590 C 1140 620 1035 612 930 560",
              "ground-drone": "M 930 560 C 860 380 780 236 690 170",
              "drone-satellite": "M 690 170 C 548 80 402 78 300 140",
              "satellite-center": "M 300 140 C 120 230 20 326 -40 420",
            },
            breakPoint: [758, 604],
            nodes: { origin: [1240, 590], ground: [930, 560], drone: [690, 170], satellite: [300, 140], center: [-40, 420] },
          },
          mobile: {
            paths: {
              directFuture: "M 610 610 C 552 604 484 560 420 486",
              direct: "M 790 582 C 736 624 674 630 622 614",
              "origin-ground": "M 790 582 C 744 616 698 610 662 566",
              "ground-drone": "M 662 566 C 630 438 596 318 552 230",
              "drone-satellite": "M 552 230 C 514 154 468 142 430 192",
              "satellite-center": "M 430 192 C 398 286 400 392 420 486",
            },
            breakPoint: [616, 612],
            nodes: { origin: [790, 582], ground: [662, 566], drone: [552, 230], satellite: [430, 192], center: [420, 486] },
          },
        },
      },
      story: {
        forward: [
          { segment: "origin-ground", source: "origin", node: "ground", duration: 760 },
          { segment: "ground-drone", source: "ground", node: "drone", duration: 820 },
          { segment: "drone-satellite", source: "drone", node: "satellite", duration: 760 },
          { segment: "satellite-center", source: "satellite", node: "center", duration: 800 },
        ],
        ack: [
          { segment: "satellite-center", node: "satellite" },
          { segment: "drone-satellite", node: "drone" },
          { segment: "ground-drone", node: "ground" },
          { segment: "origin-ground", node: "origin" },
        ],
      },
    },
  };

  global.STARRYLINK_HOME_HERO_DATA = deepFreeze(data);
})(window);
