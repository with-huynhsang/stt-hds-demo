from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel
from typing import Optional

class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: Optional[str] = None
    instance: Optional[str] = None

async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    problem = ProblemDetail(
        title=exc.detail if isinstance(exc.detail, str) else "HTTP Error", # Sometimes detail can be non-string
        status=exc.status_code,
        detail=str(exc.detail),
        instance=str(request.url.path)
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json"
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    problem = ProblemDetail(
        title="Validation Error",
        status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc.errors()),
        instance=str(request.url.path)
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=problem.model_dump(),
        media_type="application/problem+json"
    )

async def general_exception_handler(request: Request, exc: Exception):
    problem = ProblemDetail(
        title="Internal Server Error",
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="An unexpected error occurred.",
        instance=str(request.url.path)
    )
    # In production, log the actual error here
    print(f"Unhandled error: {exc}") 
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=problem.model_dump(),
        media_type="application/problem+json"
    )
