/**
 * Модуль для работы с IAM-токенами Yandex Cloud
 * Использование:
 *   const { getIamToken, getIamTokenFromCli } = require('./yc-token');
 * 
 *   // Получение через OAuth
 *   const iamToken = await getIamToken('y0__...');
 * 
 *   // Получение через YC CLI
 *   const iamToken = await getIamTokenFromCli();
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const OAUTH_ENDPOINT = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';

/**
 * Получить IAM-токен через OAuth-токен
 * @param {string} oauthToken - OAuth-токен Яндекс.Паспорта
 * @returns {Promise<{iamToken: string, expiresAt: string}>}
 */
async function getIamToken(oauthToken) {
    const response = await fetch(OAUTH_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            yandexPassportOauthToken: oauthToken,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка получения IAM-токена: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.iamToken) {
        throw new Error('IAM-токен не получен в ответе API');
    }

    return {
        iamToken: data.iamToken,
        expiresAt: data.expiresAt,
    };
}

/**
 * Получить IAM-токен через YC CLI
 * @returns {Promise<string>}
 */
async function getIamTokenFromCli() {
    try {
        const { stdout, stderr } = await execAsync('yc iam create-token');
        
        if (stderr && !stderr.includes('Warning')) {
            console.error('YC CLI stderr:', stderr);
        }

        const token = stdout.trim();
        
        if (!token) {
            throw new Error('YC CLI вернул пустой токен');
        }

        return token;
    } catch (error) {
        if (error.message.includes('yc: command not found') || error.code === 127) {
            throw new Error('YC CLI не установлен. Установите: https://yandex.cloud/docs/cli/quickstart');
        }
        if (error.message.includes('profile') && error.message.includes('not found')) {
            throw new Error('YC CLI не авторизован. Выполните: yc init');
        }
        throw new Error(`Ошибка YC CLI: ${error.message}`);
    }
}

/**
 * Проверить, установлен и авторизован ли YC CLI
 * @returns {Promise<{installed: boolean, authorized: boolean, version?: string}>}
 */
async function checkYcCli() {
    try {
        const { stdout } = await execAsync('yc --version');
        const version = stdout.trim();
        
        try {
            await execAsync('yc config list');
            return { installed: true, authorized: true, version };
        } catch {
            return { installed: true, authorized: false, version };
        }
    } catch {
        return { installed: false, authorized: false };
    }
}

/**
 * Создать заголовок Authorization для запросов к Yandex Cloud API
 * @param {string} iamToken - IAM-токен
 * @returns {string}
 */
function createAuthHeader(iamToken) {
    return `Bearer ${iamToken}`;
}

module.exports = {
    getIamToken,
    getIamTokenFromCli,
    checkYcCli,
    createAuthHeader,
    OAUTH_ENDPOINT,
};
