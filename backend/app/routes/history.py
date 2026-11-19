import csv
import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import HistoryModel
from app.schemas import HistoryItem, NewHistoryItem

router = APIRouter(prefix="/history", tags=["History"])

@router.get("", response_model=List[HistoryItem])
def list_history(db: Session = Depends(get_db)):
    records = db.query(HistoryModel).order_by(HistoryModel.created_at.desc()).all()
    return records

@router.post("", response_model=HistoryItem, status_code=201)
def add_history(item: NewHistoryItem, db: Session = Depends(get_db)):
    record = HistoryModel(
        source=item.source,
        filename=item.filename,
        count=item.count,
        level=item.level,
        model=item.model
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@router.delete("/{item_id}", status_code=200)
def delete_history(item_id: str, db: Session = Depends(get_db)):
    record = db.query(HistoryModel).filter(HistoryModel.id == item_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"History record with ID '{item_id}' not found.")
    db.delete(record)
    db.commit()
    return {"detail": "Record deleted successfully."}

@router.get("/export.csv")
def export_csv(db: Session = Depends(get_db)):
    records = db.query(HistoryModel).order_by(HistoryModel.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Source", "Filename", "Count", "Level", "Model", "Timestamp"])
    for r in records:
        writer.writerow([r.id, r.source, r.filename, r.count, r.level, r.model, r.created_at])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="crowd_history.csv"'}
    )
