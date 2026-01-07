import { defineConfig } from 'wxt';
import path from 'path';

export default defineConfig({
    manifest: {
        name: '__MSG_extensionName__',
        description: '__MSG_extensionDescription__',
        version: '1.0.0',
        default_locale: 'zh_CN',
        icons: {
            16: 'icons/icon16.png',
            32: 'icons/icon32.png',
            48: 'icons/icon48.png',
            128: 'icons/icon128.png'
        },

        permissions: [
            'storage',
            'activeTab',
            'scripting',
            'contextMenus'
        ],

        host_permissions: ['<all_urls>'],

        commands: {
            'toggle-translation': {
                suggested_key: {
                    default: 'Alt+T',
                    mac: 'Alt+T'
                },
                description: '__MSG_commandToggleTranslation__'
            }
        },

        web_accessible_resources: [{
            resources: [
                'icons/*',
                'css/*',
                'wordlist/*',
                'audio-player.html',
                'audio-player.js'
            ],
            matches: ['<all_urls>']
        }],

        action: {
            default_title: '__MSG_extensionName__',
            default_popup: 'popup.html',
            default_icon: {
                16: 'icons/icon16.png',
                32: 'icons/icon32.png',
                48: 'icons/icon48.png',
                128: 'icons/icon128.png'
            }
        }
    },

    // 使用hooks修改manifest
    hooks: {
        'build:manifestGenerated': (wxt, manifest) => {
            // 强制options_ui在新标签页打开
            if (manifest.options_ui) {
                manifest.options_ui.open_in_tab = true;
            }

            // 注意：content_scripts由WXT自动从entrypoints/content.ts生成
            // 不需要手动配置

            return manifest;
        }
    },

    // 路径别名
    alias: {
        '~': path.resolve(__dirname, 'components')
    }
});
