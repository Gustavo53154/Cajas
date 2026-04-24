import win32com.client as win32
import os
from PyPDF2 import PdfMerger

# Días de la semana en español
dias_de_la_semana = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

def adjust_column_width(sheet, sheet_name):
    if "Ecommerce" in sheet_name or "Self" in sheet_name or "RS" in sheet_name or "Supervisor(@)" in sheet_name or "Cajer@" in sheet_name:
        sheet.Columns.AutoFit()
    else:
        sheet.Columns(1).AutoFit()

def set_page_orientation(sheet, sheet_name):
    if "Cajer@" in sheet_name:
        sheet.PageSetup.Orientation = 2  # Horizontal
    else:
        sheet.PageSetup.Orientation = 1  # Vertical

def apply_borders(sheet, last_row, last_column):
    border_range = sheet.Range(sheet.Cells(1, 1), sheet.Cells(last_row, last_column + 1))

    xlEdgeLeft = 7
    xlEdgeTop = 8
    xlEdgeBottom = 9
    xlEdgeRight = 10
    xlInsideVertical = 11
    xlInsideHorizontal = 12

    for edge in [xlEdgeLeft, xlEdgeTop, xlEdgeBottom, xlEdgeRight]:
        border_range.Borders(edge).LineStyle = 1
        border_range.Borders(edge).Weight = 2

    for edge in [xlInsideVertical, xlInsideHorizontal]:
        border_range.Borders(edge).LineStyle = 1
        border_range.Borders(edge).Weight = 2

def save_sheet_as_pdf(sheet, output_dir, pdf_filename):
    sheet.PageSetup.PaperSize = 9
    sheet.PageSetup.Zoom = False
    sheet.PageSetup.FitToPagesWide = 1
    sheet.PageSetup.FitToPagesTall = 1
    sheet.PageSetup.CenterHorizontally = True
    sheet.PageSetup.CenterVertically = True

    # 🔥 CAMBIO AQUÍ
    last_column = sheet.UsedRange.Columns.Count

    last_row = min(sheet.Cells(sheet.Rows.Count, 1).End(-4162).Row, 74)

    sheet.PageSetup.PrintArea = sheet.Range(
        sheet.Cells(1, 1),
        sheet.Cells(last_row, last_column + 1)
    ).Address

    apply_borders(sheet, last_row, last_column)

    pdf_path = os.path.join(output_dir, pdf_filename)
    sheet.ExportAsFixedFormat(0, pdf_path)
    return pdf_path

def process_excel_to_pdf(excel_path, output_dir):
    excel = win32.Dispatch('Excel.Application')
    workbook = excel.Workbooks.Open(excel_path)
    
    all_pdfs = []
    grouped_pdfs = []
    
    individual_folder = os.path.join(output_dir, "Individuales")
    days_folder = os.path.join(output_dir, "Dias")
    combined_folder = os.path.join(output_dir, "Combinado")
    
    os.makedirs(individual_folder, exist_ok=True)
    os.makedirs(days_folder, exist_ok=True)
    os.makedirs(combined_folder, exist_ok=True)
    
    day_group = []
    sheet_count = 0
    day_index = 0
    
    for sheet in workbook.Sheets:
        if sheet.UsedRange.Count > 1:
            sheet_name = sheet.Name

            adjust_column_width(sheet, sheet_name)
            set_page_orientation(sheet, sheet_name)
            
            pdf_filename = f"{sheet_name}.pdf"
            pdf_path = save_sheet_as_pdf(sheet, individual_folder, pdf_filename)
            all_pdfs.append(pdf_path)
            
            day_group.append(pdf_path)
            sheet_count += 1
            
            if sheet_count == 5:
                day_pdf_path = os.path.join(days_folder, f"{dias_de_la_semana[day_index]}.pdf")
                merger = PdfMerger()

                for pdf in day_group:
                    merger.append(pdf)

                merger.write(day_pdf_path)
                merger.close()

                grouped_pdfs.append(day_pdf_path)

                day_group = []
                sheet_count = 0
                day_index += 1

                if day_index >= len(dias_de_la_semana):
                    day_index = 0

    if day_group:
        day_pdf_path = os.path.join(days_folder, f"{dias_de_la_semana[day_index]}.pdf")
        merger = PdfMerger()

        for pdf in day_group:
            merger.append(pdf)

        merger.write(day_pdf_path)
        merger.close()
        grouped_pdfs.append(day_pdf_path)
    
    final_pdf_path = os.path.join(combined_folder, "combined_output.pdf")
    merger = PdfMerger()
    
    for pdf in grouped_pdfs:
        merger.append(pdf)
    
    merger.write(final_pdf_path)
    merger.close()
    
    workbook.Close(False)
    excel.Quit()
    
    print(f"Proceso completado. Todos los archivos PDF se han guardado en {output_dir}")

# Rutas
current_directory = os.path.dirname(os.path.abspath(__file__))
excel_file_path = os.path.join(current_directory, "Horario_Semana_Completo.xlsx")
output_directory = os.path.join(current_directory, "Exportados")

os.makedirs(output_directory, exist_ok=True)

process_excel_to_pdf(excel_file_path, output_directory)