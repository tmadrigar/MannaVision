using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace MannaVisionLauncher
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string fixedProjectDir = @"d:\PROJETOS\PYCHARM\MannaVision2";
            string currentDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            string targetDir = fixedProjectDir;
            if (File.Exists(Path.Combine(currentDir, "iniciar.bat")))
            {
                targetDir = currentDir;
            }

            string batPath = Path.Combine(targetDir, "iniciar.bat");
            if (!File.Exists(batPath))
            {
                MessageBox.Show(
                    "Nao foi possivel encontrar o arquivo iniciar.bat em:\n" + batPath + 
                    "\n\nVerifique se a pasta do projeto ainda existe neste local.",
                    "MannaVision - Erro de Inicializacao",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "cmd.exe";
            // /k mantem a janela aberta exibindo os logs e permitindo encerrar com Ctrl+C sem fechar a janela
            psi.Arguments = "/k \"\"" + batPath + "\"\"";
            psi.WorkingDirectory = targetDir;
            psi.UseShellExecute = true;

            try
            {
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Ocorreu um erro ao iniciar o MannaVision:\n" + ex.Message,
                    "MannaVision - Erro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
