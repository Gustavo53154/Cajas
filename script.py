import os
import sys

def clear_screen():
    # Clear the terminal screen
    if os.name == 'nt':  # For Windows
        os.system('cls')
    else:  # For macOS and Linux
        os.system('clear')

def menu():
    while True:
        clear_screen()  # Clear the screen before displaying the menu
        print("Selecciona una opción:")
        print("1. Registrar Personal")
        print("12. Registrar NICKNAMES de Personal")
        print("121. Registrar Personas Fijas para Cajas Rapidas")
        print("2. Limpiar Horario")
        print("3. Registrar Horario")
        print("31. Editar Horario")
        print("32. Ver Horario de Personal ESPECIFICO")
        print("33. Cambiar Orden Personal")
        print("4. Entradas y Salidas")
        print("41. Ver Personal Presente A Cierta Hora")
        print("5. Exportar WhatsApp")
        print("6. Exportar Excel de Mapa de Horario DIA ESPECIFICO")
        print("7. Exportar Excel de Mapa de Horario SEMANAL")
        print("8. Exportar Excel de Mapa de Horario SEMANAL a PDF")
        print("9. Exportar Excel de Mapa de Personal del Area DIA ESPECIFICO")
        print("10. Exportar Excel de Mapa de Personal del Area SEMANAL")
        print("11. Exportar Excel de Mapa de Personal del Area SEMANAL a PDF")
        print("13. Generar Ubicacion de Cajer@s DIA ESPECIFICO")
        print("14. Generar Ubicacion de Cajer@s SEMANAL EN EXCEL")
        print("15. Generar Ubicacion de Cajer@s SEMANAL a PDF")
        print("19. Generar PDF SEMANAL (Juntar todos los documentos Semanales en un PDF) (Ejecutar 7, 8, 10, 11, 14y 15)")
        print("20. Tools")
        print("0. Salir")
        
        choice = input("Ingresa el número de tu elección: ")
        
        if choice == '1':
            run_script('registrarPersonalV1.py')
        elif choice == '12':
            run_script('nick.py')
        elif choice == '121':
            run_script('InhabilitadosToggle.py')
        elif choice == '2':
            run_script('limpiarHorario.py')
        elif choice == '3':
            run_script('registrarHorarioV7.py')
        elif choice == '31':
            run_script('editarHorario.py')
        elif choice == '32':
            run_script('verHorarioPersonal.py')
        elif choice == '33':
            run_script('orden.py')
        elif choice == '4':
            run_script('EntradasSalidasV5.py')
        elif choice == '41':
            run_script('personalPresente.py')
        elif choice == '5':
            run_script('ExportarWhatsappV1.py')
        elif choice == '6':
            run_script('newGraficV8.py')
        elif choice == '7':
            run_script('GenerarHojasSemanaV5.py')
        elif choice == '8':
            run_script('ExportarImprimibleV6.py')
        elif choice == '9':
            run_script('ESV2.py')
        elif choice == '10':
            run_script('ESSemanalV4.py')
        elif choice == '11':
            run_script('ExportarESaPDF.py')
        elif choice == '13':
            run_script('ExcelUbicacionV1.py')
        elif choice == '14':
            run_script('ExcelUbicacionSemanal.py')
            run_script('ponerFecha.py')
        elif choice == '15':
            run_script('ExportarUbicacionSemanalPDF.py')
        elif choice == '19':
            run_script('GenerarHojasSemanaV5.py')
            run_script('ExportarImprimibleV6.py')
            run_script('ESSemanalV4.py')
            run_script('ExportarESaPDF.py')
            run_script('ExcelUbicacionSemanal.py')
            run_script('ponerFechaV1.py')
            run_script('ExportarUbicacionSemanalPDF.py')
            run_script('mergerV1.py')
            op = input("Imprimir? : ")
            if op == "1":
                run_script('ImprimirExportado.py')
        elif choice == '20':
            run_script('Tools.py')
        elif choice == '0':
            print("Saliendo...")
            sys.exit()
        else:
            print("Opción no válida. Inténtalo de nuevo.")
            input("Presiona Enter para continuar...")

def run_script(script_name):
    clear_screen()  # Clear the screen before running the script
    if os.path.exists(script_name):
        print(f"Ejecutando {script_name}...")
        os.system(f'python {script_name}')
    else:
        print(f"El archivo {script_name} no se encuentra.")
        input()
    #input("Presiona Enter para continuar...")  # Wait for user input before returning to the menu
    clear_screen()  # Clear the screen before displaying the menu again

if __name__ == "__main__":
    menu()
