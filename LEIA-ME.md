# Torre de Resfriamento: supervisório 3D no GitHub Pages

Esta versão roda inteira no navegador, sem Python e sem instalar nada. Serve para abrir de qualquer PC ou celular por um link.

- **No computador (Chrome ou Edge):** escolha **Arduino via USB (Web Serial)**, clique em **Conectar** e selecione a porta do Arduino na janela do navegador. O Arduino precisa estar com o firmware v2 (pasta `site/arduino`, 115200 baud). Os comandos local, remoto e manual funcionam igual à versão do PC.
- **No celular ou em outro navegador:** escolha **Simulador (sem placa)**. Ele usa a mesma lógica do firmware (histerese 18/20/33/35 °C e PWM de 70 % a 100 %).

Web Serial só existe no Chrome/Edge de computador e só funciona em página HTTPS, que é o caso do GitHub Pages. O celular não acessa a USB do Arduino pelo navegador.

## Publicar (uma vez)

1. Crie um repositório público no GitHub, por exemplo `torre-resfriamento`.
2. Envie para ele o conteúdo desta pasta: a pasta `site/`, a pasta `.github/` e este arquivo. Pelo site do GitHub dá para arrastar os arquivos em **Add file > Upload files** (a pasta `.github` precisa ir junto; se o navegador não deixar, crie o arquivo `.github/workflows/pages.yml` em **Add file > Create new file** e cole o conteúdo).
3. Em **Settings > Pages**, em **Source**, escolha **GitHub Actions**.
4. Faça um commit na branch `main` (ou rode o workflow em **Actions > Publicar no GitHub Pages > Run workflow**).
5. Em 1 a 2 minutos o endereço aparece em **Settings > Pages**, no formato `https://SEU-USUARIO.github.io/torre-resfriamento/`.

Alternativa sem Actions: em **Settings > Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e envie o conteúdo de `site/` direto na raiz do repositório.

## O que mudou em relação à versão do PC

- `navegador.js` substitui o `servidor.py`: implementa a Web Serial, o simulador e as mesmas rotas `/api` que a interface usa.
- `index.html` carrega `navegador.js` antes do `app.js`. O resto (torre 3D, alarmes, tendência, CSV, temas) é o mesmo código.
