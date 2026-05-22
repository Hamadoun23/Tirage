"""Fusionne Post1-5.xls en post/MegaPost.xls (dédupliqué par ID_utilisateur)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POST_DIR = ROOT / "post"


def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def parse_xls(path: Path) -> list[tuple[str, str, str]]:
    text = path.read_text(encoding="utf-8")
    rows = re.findall(r"<Row>(.*?)</Row>", text, re.DOTALL)
    participants = []
    for row in rows[1:]:
        cells = re.findall(r'<Data ss:Type="String">([^<]*)</Data>', row)
        if len(cells) < 2:
            continue
        nom, uid = cells[0].strip(), cells[1].strip()
        if not nom or not uid:
            continue
        profil = cells[2].strip() if len(cells) >= 3 else f"https://www.facebook.com/{uid}"
        participants.append((nom, uid, profil))
    return participants


def build_megapost() -> int:
    seen: dict[str, tuple[str, str, str]] = {}

    for i in range(1, 6):
        path = POST_DIR / f"Post{i}.xls"
        if not path.exists():
            raise FileNotFoundError(path)
        for nom, uid, profil in parse_xls(path):
            key = uid.lower()
            if key not in seen:
                seen[key] = (nom, uid, profil)

    participants = sorted(seen.values(), key=lambda p: p[0].casefold())
    row_count = len(participants) + 1

    data_rows = "\n".join(
        f"""   <Row>
    <Cell><Data ss:Type="String">{escape_xml(nom)}</Data></Cell>
    <Cell><Data ss:Type="String">{escape_xml(uid)}</Data></Cell>
    <Cell><Data ss:Type="String">{escape_xml(profil)}</Data></Cell>
   </Row>"""
        for nom, uid, profil in participants
    )

    workbook = f"""<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Version>16.00</Version>
 </DocumentProperties>
 <OfficeDocumentSettings xmlns="urn:schemas-microsoft-com:office:office">
  <AllowPNG/>
 </OfficeDocumentSettings>
 <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
  <WindowHeight>7620</WindowHeight>
  <WindowWidth>20490</WindowWidth>
  <WindowTopX>0</WindowTopX>
  <WindowTopY>0</WindowTopY>
  <ProtectStructure>False</ProtectStructure>
  <ProtectWindows>False</ProtectWindows>
 </ExcelWorkbook>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Partages">
  <Table ss:ExpandedColumnCount="3" ss:ExpandedRowCount="{row_count}" x:FullColumns="1"
   x:FullRows="1" ss:DefaultColumnWidth="60" ss:DefaultRowHeight="15">
   <Column ss:Width="142.5"/>
   <Column ss:Width="180"/>
   <Column ss:Width="419.25"/>
   <Row>
    <Cell><Data ss:Type="String">Nom</Data></Cell>
    <Cell><Data ss:Type="String">ID_utilisateur</Data></Cell>
    <Cell><Data ss:Type="String">Profil</Data></Cell>
   </Row>
{data_rows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Header x:Margin="0.4921259845"/>
    <Footer x:Margin="0.4921259845"/>
    <PageMargins x:Bottom="0.984251969" x:Left="0.78740157499999996"
     x:Right="0.78740157499999996" x:Top="0.984251969"/>
   </PageSetup>
   <Selected/>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
 </Worksheet>
</Workbook>
"""

    out = POST_DIR / "MegaPost.xls"
    out.write_text(workbook, encoding="utf-8")
    print(f"MegaPost.xls : {len(participants)} participants uniques")
    return len(participants)


if __name__ == "__main__":
    build_megapost()
